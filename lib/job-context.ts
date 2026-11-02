import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ProjectStatus } from '@/lib/domain'

/**
 * Job lookups for the global project selector. Project context comes from the URL only (see lib/route-job);
 * every id is re-queried under RLS before its name is shown.
 */
export const JOB_SEARCH_LIMIT = 8

export type JobSummary = {
  id: string
  name: string
  projectNumber: string | null
  status: ProjectStatus
  city: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const JOB_COLUMNS = 'id, name, project_number, status, city'

type JobRow = { id: string; name: string; project_number: string | null; status: string; city: string | null }

const toSummary = (r: JobRow): JobSummary => ({
  id: r.id,
  name: r.name,
  projectNumber: r.project_number,
  status: r.status as ProjectStatus,
  city: r.city,
})

/** Escapes characters that carry meaning in PostgREST `or` filters and ILIKE patterns. */
export function sanitizeJobQuery(query: string): string {
  return query
    .replace(/[%_\\,()*:."']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/**
 * Loads one authorized job. Returns null when RLS hides it or it no longer exists. Archived jobs are excluded
 * unless `includeArchived` is set (an archived project's own pages are still viewable).
 */
export async function getAuthorizedJob(
  organizationId: string,
  projectId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<JobSummary | null> {
  if (!UUID.test(projectId)) return null
  const supabase = await createClient()
  let query = supabase.from('projects').select(JOB_COLUMNS).eq('id', projectId).eq('organization_id', organizationId)
  if (!includeArchived) query = query.is('archived_at', null)
  const { data } = await query.maybeSingle()
  return data ? toSummary(data as JobRow) : null
}

/** Bounded, RLS-scoped search. Selects only identity columns, never financial data. */
export async function searchAuthorizedJobs(organizationId: string, rawQuery: string): Promise<JobSummary[]> {
  const q = sanitizeJobQuery(rawQuery)
  const supabase = await createClient()
  let query = supabase
    .from('projects')
    .select(JOB_COLUMNS)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
  if (q) {
    const p = `%${q}%`
    query = query.or(`name.ilike.${p},project_number.ilike.${p},city.ilike.${p},address_line1.ilike.${p}`)
  }
  const { data } = await query.order('updated_at', { ascending: false }).limit(JOB_SEARCH_LIMIT)
  return ((data ?? []) as JobRow[]).map(toSummary)
}
