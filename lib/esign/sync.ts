import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DOCUMENTS_BUCKET, documentStoragePath } from '@/lib/documents'
import { estimateApprovalFromSignature, signedDocumentIds, signedDocumentName } from '@/lib/esign/signed-artifacts'
import { downloadSignedPdf, ProviderError, type ProviderSignatureRequest } from '@/lib/esign/dropbox-sign'
import { TERMINAL_STATUSES, type SignatureStatus, type SignerStatus } from '@/lib/signatures'

type RequestRow = {
  id: string
  organization_id: string
  project_id: string
  status: SignatureStatus
  title: string
  requested_by: string
  signed_storage_path: string | null
}

const SIGNER_STATUS: Record<string, SignerStatus> = {
  awaiting_signature: 'awaiting',
  signed: 'signed',
  declined: 'declined',
  on_hold: 'on_hold',
}

const ts = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null)

export function deriveStatus(sr: ProviderSignatureRequest, override?: SignatureStatus): SignatureStatus {
  if (override) return override
  if (sr.has_error) return 'failed'
  if (sr.is_declined) return 'declined'
  if (sr.is_complete) return 'completed'
  if (sr.expires_at && sr.expires_at * 1000 < Date.now()) return 'expired'
  return sr.signatures.some((s) => s.status_code === 'signed') ? 'partially_signed' : 'awaiting_signatures'
}

/**
 * Applies verified provider state (from an HMAC-verified webhook or a direct API read) to our records.
 * Idempotent: safe to run for duplicate, retried, or out-of-order events. Terminal states never regress.
 */
export async function applyProviderState(
  admin: SupabaseClient,
  row: RequestRow,
  sr: ProviderSignatureRequest,
  override?: SignatureStatus,
): Promise<{ status: SignatureStatus; artifactStored: boolean }> {
  const { data: signers } = await admin
    .from('signature_request_signers')
    .select('id, email, signing_order, provider_signature_id')
    .eq('request_id', row.id)

  for (const ps of sr.signatures ?? []) {
    const match =
      signers?.find((s) => s.provider_signature_id === ps.signature_id) ??
      signers?.find((s) => !s.provider_signature_id && s.email === ps.signer_email_address?.toLowerCase())
    if (!match) continue
    await admin
      .from('signature_request_signers')
      .update({
        provider_signature_id: ps.signature_id,
        status: SIGNER_STATUS[ps.status_code] ?? 'error',
        signed_at: ts(ps.signed_at),
        last_viewed_at: ts(ps.last_viewed_at),
        decline_reason: ps.decline_reason ?? null,
      })
      .eq('id', match.id)
  }

  const next = deriveStatus(sr, override)
  const keep = TERMINAL_STATUSES.includes(row.status) && row.status !== next
  const status = keep ? row.status : next
  await admin
    .from('signature_requests')
    .update({
      status,
      provider_snapshot: sr,
      expires_at: ts(sr.expires_at),
      ...(status === 'completed' && row.status !== 'completed' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', row.id)

  if (status !== row.status && (status === 'completed' || status === 'declined')) {
    // A duplicate (user_id, dedupe_key) insert fails on the partial unique index, which is the intended de-duplication.
    await admin.from('notifications').insert(
      {
        organization_id: row.organization_id,
        user_id: row.requested_by,
        project_id: row.project_id,
        kind: 'signature_request',
        title: status === 'completed' ? `Signed: ${row.title}` : `Signature declined: ${row.title}`,
        body: status === 'completed' ? 'All signers have signed. The signed PDF is stored with the project documents.' : 'A signer declined to sign. Open the document to see details.',
        link: `/projects/${row.project_id}/documents`,
        dedupe_key: `signature:${row.id}:${status}`,
      },
    )
  }

  let artifactStored = Boolean(row.signed_storage_path)
  if (status === 'completed' && !row.signed_storage_path && sr.is_complete) {
    artifactStored = await storeSignedArtifact(admin, row, sr.signature_request_id)
  }
  if (status === 'completed' && artifactStored) {
    // Each step is idempotent, so a retried webhook or manual refresh completes anything a failed attempt missed.
    try {
      await registerSignedDocument(admin, row.id)
    } catch (e) {
      console.error('[esign] signed document registration failed', row.id, e instanceof Error ? e.message : e)
    }
    try {
      await approveEstimateFromSignature(admin, row.id, sr)
    } catch (e) {
      console.error('[esign] estimate approval from signature failed', row.id, e instanceof Error ? e.message : e)
    }
  }
  return { status, artifactStored }
}

/** Registers the signed PDF in Project Documents as its own internal document, once per request. */
async function registerSignedDocument(admin: SupabaseClient, requestId: string): Promise<void> {
  const { data: req } = await admin
    .from('signature_requests')
    .select('id, organization_id, project_id, document_id, requested_by, signed_storage_path, signed_size_bytes, completed_at, title')
    .eq('id', requestId)
    .maybeSingle()
  if (!req?.signed_storage_path) return

  const { documentId, versionId } = signedDocumentIds(req.id)
  const { data: existing } = await admin.from('project_documents').select('id, current_version_id').eq('id', documentId).maybeSingle()
  if (existing?.current_version_id) return

  const { data: source } = await admin.from('project_documents').select('name, category').eq('id', req.document_id).maybeSingle()
  const path = documentStoragePath(req.organization_id, req.project_id, documentId, versionId, 'application/pdf')
  const { error: copyError } = await admin.storage.from(DOCUMENTS_BUCKET).copy(req.signed_storage_path, path)
  if (copyError && !/exists|duplicate/i.test(copyError.message)) throw new Error(copyError.message)

  if (!existing) {
    const { error } = await admin.from('project_documents').insert({
      id: documentId,
      organization_id: req.organization_id,
      project_id: req.project_id,
      scope: 'project',
      name: signedDocumentName(source?.name ?? req.title),
      description: `Executed copy returned by Dropbox Sign for "${req.title}". This is the signed record and cannot be replaced.`.slice(0, 2000),
      category: source?.category ?? 'contracts',
      visibility: 'internal',
      created_by: req.requested_by,
      updated_by: req.requested_by,
    })
    if (error && error.code !== '23505') throw new Error(error.message)
  }

  const { error: versionError } = await admin.from('project_document_versions').insert({
    id: versionId,
    document_id: documentId,
    organization_id: req.organization_id,
    project_id: req.project_id,
    version_number: 1,
    storage_path: path,
    original_filename: `${signedDocumentName(source?.name ?? req.title).replace(/[^\w.\- ]+/g, '').trim() || 'Signed document'}.pdf`,
    content_type: 'application/pdf',
    size_bytes: req.signed_size_bytes ?? 0,
    revision_notes: 'Signed by all parties through Dropbox Sign.',
    uploaded_by: req.requested_by,
    uploaded_at: req.completed_at ?? new Date().toISOString(),
  })
  if (versionError && versionError.code !== '23505') throw new Error(versionError.message)

  await admin
    .from('project_documents')
    .update({ current_version_id: versionId, current_version_number: 1 })
    .eq('id', documentId)
    .is('current_version_id', null)
}

/** Approves the estimate whose exact signing copy was signed; any other request leaves estimates unchanged. */
async function approveEstimateFromSignature(admin: SupabaseClient, requestId: string, sr: ProviderSignatureRequest): Promise<void> {
  const { data: req } = await admin
    .from('signature_requests')
    .select('id, status, test_mode, project_id, document_id, source_version_id, provider_request_id, completed_at')
    .eq('id', requestId)
    .maybeSingle()
  if (!req?.document_id || !req.source_version_id) return

  // Only the exact signing copy generated for an estimate revision can approve it.
  const { data: snapshot } = await admin
    .from('estimate_signing_snapshots')
    .select('estimate_id, project_id, document_id, version_id')
    .eq('document_id', req.document_id)
    .eq('version_id', req.source_version_id)
    .maybeSingle()
  if (!snapshot) return

  const { data: estimate } = await admin
    .from('estimates')
    .select('id, status, project_id, expiration_date')
    .eq('id', snapshot.estimate_id)
    .maybeSingle()
  const decision = estimateApprovalFromSignature({
    sameProject: Boolean(estimate) && estimate?.project_id === req.project_id && snapshot.project_id === req.project_id,
    estimateExpirationDate: estimate?.expiration_date ?? null,
    completedAt: req.completed_at,
    requestStatus: req.status,
    testMode: req.test_mode || sr.test_mode,
    requestDocumentId: req.document_id,
    requestSourceVersionId: req.source_version_id,
    snapshot,
    estimateStatus: estimate?.status ?? null,
    signerNames: (sr.signatures ?? []).filter((s) => s.status_code === 'signed').map((s) => s.signer_name),
  })
  if (!decision.approve || !estimate) return

  const { error } = await admin
    .from('estimates')
    .update({
      status: 'approved',
      decision_by_name: decision.decisionByName,
      decision_method: 'other',
      decision_note: `Approved by electronic signature through Dropbox Sign (request ${req.provider_request_id}). The signed PDF is in Project Documents.`,
      decision_at: req.completed_at ?? new Date().toISOString(),
    })
    .eq('id', estimate.id)
    .eq('status', 'submitted')
  if (error) throw new Error(error.message)
}

async function storeSignedArtifact(admin: SupabaseClient, row: RequestRow, providerId: string): Promise<boolean> {
  const path = `signed/${row.organization_id}/${row.project_id}/${row.id}.pdf`
  try {
    const bytes = await downloadSignedPdf(providerId)
    const { error } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, bytes, { contentType: 'application/pdf', upsert: false })
    if (error && !/exists|duplicate/i.test(error.message)) throw new Error(error.message)
    await admin
      .from('signature_requests')
      .update({ signed_storage_path: path, signed_size_bytes: bytes.length, signed_stored_at: new Date().toISOString(), artifact_error: null })
      .eq('id', row.id)
      .is('signed_storage_path', null)
    return true
  } catch (e) {
    const message =
      e instanceof ProviderError && e.code === 'files_not_ready'
        ? 'Dropbox Sign is still finalizing the signed PDF. It is stored automatically when ready.'
        : 'The signed PDF could not be retrieved yet. Use Refresh status to try again.'
    console.error('[esign] signed artifact retrieval failed', row.id, e instanceof Error ? e.message : e)
    await admin.from('signature_requests').update({ artifact_error: message }).eq('id', row.id)
    return false
  }
}

export async function recordEvent(
  admin: SupabaseClient,
  row: { id: string; organization_id: string },
  event: { key: string; type: string; time: Date; signatureId?: string | null; source: 'webhook' | 'sync' | 'app'; details?: Record<string, unknown> },
): Promise<boolean> {
  const { data } = await admin
    .from('signature_events')
    .upsert(
      {
        request_id: row.id,
        organization_id: row.organization_id,
        event_key: event.key,
        event_type: event.type,
        event_time: event.time.toISOString(),
        provider_signature_id: event.signatureId ?? null,
        source: event.source,
        details: event.details ?? null,
      },
      { onConflict: 'event_key', ignoreDuplicates: true },
    )
    .select('id')
  return Boolean(data?.length)
}
