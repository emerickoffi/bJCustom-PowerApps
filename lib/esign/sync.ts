import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DOCUMENTS_BUCKET } from '@/lib/documents'
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
  return { status, artifactStored }
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
