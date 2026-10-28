'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession, canManage } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getEstimate, getEstimateFamily, getEstimateLineItems } from '@/lib/estimate-queries'
import { getProviderConfig } from '@/lib/esign/dropbox-sign'
import { renderEstimatePdf } from '@/lib/esign/estimate-pdf-render'
import { estimateSigningEligibility } from '@/lib/estimate-signing'
import { estimateSigningFilename } from '@/lib/estimate-pdf'
import { DOCUMENTS_BUCKET, DOCUMENT_MAX_BYTES, documentStoragePath } from '@/lib/documents'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

/** A claim older than this is treated as abandoned (e.g. the server crashed mid-upload) and can be retried. */
const STALE_CLAIM_MS = 2 * 60 * 1000

/**
 * Returns the immutable signing snapshot for an estimate revision, creating it on first use.
 * The PDF is rendered on the server from the stored records, saved to Project Documents
 * (Estimates category, internal), and linked to the revision so repeated requests reuse it.
 */
export async function prepareEstimateSigning(estimateId: string): Promise<Result<{ documentId: string; name: string; created: boolean }>> {
  const session = await getSession()
  if (!session?.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return { ok: false, error: 'Staff access required.' }
  }
  if (!z.uuid().safeParse(estimateId).success) return { ok: false, error: 'Estimate not found.' }
  const orgId = session.organizationId

  const estimate = await getEstimate(estimateId, orgId)
  if (!estimate) return { ok: false, error: 'Estimate not found.' }
  const [family, items, features] = await Promise.all([
    getEstimateFamily(estimate.family_id),
    getEstimateLineItems(estimate.id),
    getOrgFeatures(orgId),
  ])

  const eligibility = estimateSigningEligibility({
    status: estimate.status,
    isLatest: (family[0]?.id ?? estimate.id) === estimate.id,
    canManage: canManage(session.role),
    documentsEnabled: features.documents,
    signaturesEnabled: features.e_signatures,
    providerConfigured: getProviderConfig().configured,
    hasProject: Boolean(estimate.project),
    lineCount: items.length,
  })
  if (!eligibility.eligible) return { ok: false, error: eligibility.reason }
  const project = estimate.project!

  const admin = createAdminClient()
  const name = `Estimate ${estimate.estimate_number} Rev ${estimate.revision} — ${estimate.name}`.slice(0, 200)

  const existing = async () =>
    admin
      .from('estimate_signing_snapshots')
      .select('document_id, claimed_at, project_documents:document_id(id, name, archived_at)')
      .eq('estimate_id', estimate.id)
      .maybeSingle()

  const reuse = (row: NonNullable<Awaited<ReturnType<typeof existing>>['data']>): Result<{ documentId: string; name: string; created: boolean }> | null => {
    if (!row.document_id) return null
    const doc = Array.isArray(row.project_documents) ? row.project_documents[0] : row.project_documents
    if (doc?.archived_at) return { ok: false, error: 'The signing copy for this revision is archived. Restore it in Project Documents to request signatures.' }
    return { ok: true, data: { documentId: row.document_id, name: doc?.name ?? name, created: false } }
  }

  const { data: current } = await existing()
  if (current) {
    const reused = reuse(current)
    if (reused) return reused
    if (Date.now() - new Date(current.claimed_at).getTime() < STALE_CLAIM_MS) {
      return { ok: false, error: 'The signing copy is being prepared. Try again in a moment.' }
    }
    await admin.from('estimate_signing_snapshots').delete().eq('estimate_id', estimate.id).is('document_id', null)
  }

  const { error: claimError } = await admin.from('estimate_signing_snapshots').insert({
    estimate_id: estimate.id,
    organization_id: orgId,
    project_id: project.id,
    revision: estimate.revision,
    created_by: session.userId,
  })
  if (claimError) {
    if (claimError.code === '23505') {
      const { data: raced } = await existing()
      const reused = raced ? reuse(raced) : null
      return reused ?? { ok: false, error: 'The signing copy is being prepared. Try again in a moment.' }
    }
    return { ok: false, error: 'Could not prepare the signing copy. Please try again.' }
  }

  const release = (message: string) =>
    admin.from('estimate_signing_snapshots').delete().eq('estimate_id', estimate.id).is('document_id', null).then(() => ({ ok: false as const, error: message }))

  let bytes: Uint8Array
  try {
    bytes = await renderEstimatePdf({ estimate, items, brand: session.brand, generatedAt: new Date() })
  } catch (e) {
    console.error('[estimate-signing] render failed', e)
    return release('The estimate PDF could not be generated. Please try again.')
  }
  if (bytes.length > DOCUMENT_MAX_BYTES) return release('The estimate PDF is larger than 25 MB and cannot be stored.')

  const documentId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const path = documentStoragePath(orgId, project.id, documentId, versionId, 'application/pdf')
  const filename = estimateSigningFilename({
    projectNumber: project.project_number,
    projectName: project.name,
    estimateNumber: estimate.estimate_number,
    revision: estimate.revision,
  })

  const { error: uploadError } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType: 'application/pdf', upsert: false })
  if (uploadError) return release('Could not store the signing copy. Please try again.')

  const { error: docError } = await admin.from('project_documents').insert({
    id: documentId,
    organization_id: orgId,
    project_id: project.id,
    scope: 'project',
    name,
    description: `Signing copy of estimate ${estimate.estimate_number}, revision ${estimate.revision}. Generated from the locked estimate; it cannot be replaced.`,
    category: 'estimates',
    visibility: 'internal',
    created_by: session.userId,
    updated_by: session.userId,
  })
  if (docError) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path])
    return release('Could not save the signing copy to Project Documents.')
  }

  const { error: versionError } = await admin.from('project_document_versions').insert({
    id: versionId,
    document_id: documentId,
    organization_id: orgId,
    project_id: project.id,
    version_number: 1,
    storage_path: path,
    original_filename: filename,
    content_type: 'application/pdf',
    size_bytes: bytes.length,
    revision_notes: `Generated for electronic signature from ${estimate.estimate_number} Rev ${estimate.revision}.`,
    uploaded_by: session.userId,
  })
  if (versionError) {
    await admin.from('project_documents').update({ archived_at: new Date().toISOString(), archived_by: session.userId }).eq('id', documentId)
    return release('Could not save the signing copy to Project Documents.')
  }

  await admin.from('project_documents').update({ current_version_id: versionId, current_version_number: 1, updated_by: session.userId }).eq('id', documentId)
  const { error: linkError } = await admin
    .from('estimate_signing_snapshots')
    .update({ document_id: documentId, version_id: versionId, completed_at: new Date().toISOString() })
    .eq('estimate_id', estimate.id)
  if (linkError) return { ok: false, error: 'The signing copy was saved but could not be linked to the estimate. Please try again.' }

  revalidatePath(`/estimates/${estimate.id}`)
  revalidatePath(`/projects/${project.id}/documents`)
  return { ok: true, data: { documentId, name, created: true } }
}
