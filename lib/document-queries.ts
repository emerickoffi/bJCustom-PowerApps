import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { sanitizeSearch } from '@/lib/format'
import {
  DOCUMENT_CATEGORIES,
  DOCUMENTS_PAGE_SIZE,
  isDocumentCategory,
  type DocumentCategory,
  type DocumentRow,
  type DocumentVersionRow,
} from '@/lib/documents'

const CURRENT_VERSION =
  'current_version:project_document_versions!project_documents_current_version_id_fkey(id, original_filename, content_type, size_bytes, uploaded_by, uploaded_at)'
const DOCUMENT_COLUMNS = `id, project_id, name, description, category, visibility, current_version_number, updated_at, archived_at, ${CURRENT_VERSION}`

export type DocumentFilters = {
  q?: string
  category?: string
  visibility?: string
  archived?: boolean
  projectId?: string
  page?: number
}

export type DocumentListResult =
  | { ok: true; rows: DocumentRow[]; total: number; page: number; pageCount: number }
  | { ok: false; error: string }

/** One paginated query for every entry point. RLS limits rows to the caller's organization, projects, and sharing rights. */
export async function listDocuments(filters: DocumentFilters, options: { withProject?: boolean; sharedOnly?: boolean } = {}): Promise<DocumentListResult> {
  const supabase = await createClient()
  const page = Math.max(1, Math.floor(filters.page ?? 1))
  const from = (page - 1) * DOCUMENTS_PAGE_SIZE
  const columns = options.withProject ? `${DOCUMENT_COLUMNS}, project:projects(id, name, project_number)` : DOCUMENT_COLUMNS

  let query = supabase.from('project_documents').select(columns, { count: 'exact' })
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  query = filters.archived ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  if (options.sharedOnly) query = query.eq('visibility', 'homeowner')
  else if (filters.visibility === 'internal' || filters.visibility === 'homeowner') query = query.eq('visibility', filters.visibility)
  if (isDocumentCategory(filters.category)) query = query.eq('category', filters.category)
  const q = sanitizeSearch(filters.q)
  if (q) query = query.ilike('name', `%${q.replace(/_/g, '\\_')}%`)

  const { data, error, count } = await query.order('updated_at', { ascending: false }).range(from, from + DOCUMENTS_PAGE_SIZE - 1)
  if (error) return { ok: false, error: 'Documents could not be loaded. Please refresh the page.' }
  const total = count ?? 0
  return {
    ok: true,
    rows: (data ?? []) as unknown as DocumentRow[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / DOCUMENTS_PAGE_SIZE)),
  }
}

/** Real counts of active documents per category for one project. */
export async function getCategoryCounts(projectId: string, sharedOnly = false): Promise<Record<DocumentCategory, number> | null> {
  const supabase = await createClient()
  let query = supabase.from('project_documents').select('category').eq('project_id', projectId).is('archived_at', null)
  if (sharedOnly) query = query.eq('visibility', 'homeowner')
  const { data, error } = await query
  if (error) return null
  const counts = Object.fromEntries(DOCUMENT_CATEGORIES.map((c) => [c.key, 0])) as Record<DocumentCategory, number>
  for (const row of data ?? []) if (isDocumentCategory(row.category)) counts[row.category] += 1
  return counts
}

export async function countArchivedDocuments(projectId?: string): Promise<number> {
  const supabase = await createClient()
  let query = supabase.from('project_documents').select('id', { count: 'exact', head: true }).not('archived_at', 'is', null)
  if (projectId) query = query.eq('project_id', projectId)
  const { count } = await query
  return count ?? 0
}

/** Versions the caller may read. Homeowners only ever receive the current version through RLS. */
export async function getDocumentVersions(documentId: string): Promise<DocumentVersionRow[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_document_versions')
    .select('id, version_number, original_filename, content_type, size_bytes, revision_notes, uploaded_by, uploaded_at')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
  if (error) return null
  return data as DocumentVersionRow[]
}
