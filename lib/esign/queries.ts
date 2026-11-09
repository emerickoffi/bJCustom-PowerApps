import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { SignatureStatus, SignatureSummary } from '@/lib/signatures'

export type EstimateSigningState = {
  snapshot: { documentId: string; name: string; createdAt: string | null } | null
  summary: SignatureSummary | null
}

/** The estimate revision's signing snapshot (if created) and its latest signature request, read through RLS. */
export async function getEstimateSigningState(estimateId: string): Promise<EstimateSigningState> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('estimate_signing_snapshots')
    .select('document_id, completed_at, project_documents:document_id(name)')
    .eq('estimate_id', estimateId)
    .not('document_id', 'is', null)
    .maybeSingle()
  if (!data?.document_id) return { snapshot: null, summary: null }
  const doc = Array.isArray(data.project_documents) ? data.project_documents[0] : data.project_documents
  const summaries = await getSignatureSummaries([data.document_id])
  return {
    snapshot: { documentId: data.document_id, name: (doc as { name?: string } | null)?.name ?? 'Estimate signing copy', createdAt: data.completed_at },
    summary: summaries[data.document_id] ?? null,
  }
}

export type EstimateSigningCopy = {
  estimateId: string
  documentId: string
  name: string
  createdAt: string | null
  summary: SignatureSummary | null
}

/** Signing copies for every revision in an estimate family, each tied to the revision it was prepared from. Read through RLS. */
export async function getFamilySigningCopies(estimateIds: string[]): Promise<EstimateSigningCopy[]> {
  if (!estimateIds.length) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('estimate_signing_snapshots')
    .select('estimate_id, document_id, completed_at, project_documents:document_id(name)')
    .in('estimate_id', estimateIds)
    .not('document_id', 'is', null)
  const rows = (data ?? []).filter((r): r is typeof r & { document_id: string } => Boolean(r.document_id))
  if (!rows.length) return []
  const summaries = await getSignatureSummaries(rows.map((r) => r.document_id))
  return rows.map((r) => {
    const doc = Array.isArray(r.project_documents) ? r.project_documents[0] : r.project_documents
    return {
      estimateId: r.estimate_id,
      documentId: r.document_id,
      name: (doc as { name?: string } | null)?.name ?? 'Estimate signing copy',
      createdAt: r.completed_at,
      summary: summaries[r.document_id] ?? null,
    }
  })
}

/** Latest signature request per document, read through RLS. */
export async function getSignatureSummaries(documentIds: string[]): Promise<Record<string, SignatureSummary>> {
  if (!documentIds.length) return {}
  const supabase = await createClient()
  const { data: requests } = await supabase
    .from('signature_requests')
    .select('id, document_id, source_version_id, status, signed_storage_path, created_at')
    .in('document_id', documentIds)
    .order('created_at', { ascending: false })
  const latest = new Map<string, NonNullable<typeof requests>[number]>()
  for (const r of requests ?? []) if (!latest.has(r.document_id)) latest.set(r.document_id, r)
  if (!latest.size) return {}

  const ids = [...latest.values()].map((r) => r.id)
  const [{ data: signers }, { data: versions }] = await Promise.all([
    supabase.from('signature_request_signers').select('request_id, status').in('request_id', ids),
    supabase.from('project_document_versions').select('id, version_number').in('id', [...latest.values()].map((r) => r.source_version_id)),
  ])
  const out: Record<string, SignatureSummary> = {}
  for (const [docId, r] of latest) {
    const mine = (signers ?? []).filter((s) => s.request_id === r.id)
    out[docId] = {
      requestId: r.id,
      status: r.status as SignatureStatus,
      signed: mine.filter((s) => s.status === 'signed').length,
      total: mine.length,
      versionNumber: versions?.find((v) => v.id === r.source_version_id)?.version_number ?? null,
      hasSignedPdf: Boolean(r.signed_storage_path),
    }
  }
  return out
}
