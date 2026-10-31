import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { ProjectStatus } from '@/lib/domain'

/**
 * Remembers the job a staff member is working on. The cookie only stores a hint (organization + project id);
 * every read re-queries the project under RLS, so a stale or unauthorized id silently falls back to All Jobs.
 * Kept separate from dashboard widget preferences on purpose.
 */
export const CURRENT_JOB_COOKIE = 'bj_current_job'
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

export function encodeJobCookie(organizationId: string, projectId: string) {
  return `${organizationId}:${projectId}`
}

export function decodeJobCookie(value: string | undefined, organizationId: string): string | null {
  if (!value) return null
  const [org, project] = value.split(':')
  return org === organizationId && UUID.test(project ?? '') ? project : null
}

/** Escapes characters that carry meaning in PostgREST `or` filters and ILIKE patterns. */
export function sanitizeJobQuery(query: string): string {
  return query
    .replace(/[%_\\,()*:."']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/** Loads one authorized, non-archived job. Returns null when RLS hides it or it no longer exists. */
export async function getAuthorizedJob(organizationId: string, projectId: string): Promise<JobSummary | null> {
  if (!UUID.test(projectId)) return null
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select(JOB_COLUMNS)
    .eq('id', projectId)
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .maybeSingle()
  return data ? toSummary(data as JobRow) : null
}

export async function getRememberedJob(organizationId: string): Promise<JobSummary | null> {
  const store = await cookies()
  const projectId = decodeJobCookie(store.get(CURRENT_JOB_COOKIE)?.value, organizationId)
  return projectId ? getAuthorizedJob(organizationId, projectId) : null
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
