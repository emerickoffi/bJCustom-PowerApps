import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession, type StaffSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getStaffMembers } from '@/lib/queries'
import {
  EXPORT_BATCH_SIZE,
  HISTORY_CATEGORIES,
  HISTORY_EVENT_COLUMNS,
  SYSTEM_ACTOR,
  addDays,
  isValidTimeZone,
  likePattern,
  zonedMidnightUtc,
  type HistoryEventRow,
  type HistoryFilters,
} from '@/lib/activity-history'

import { APP_TIME_ZONE } from '@/lib/format'

type Supabase = Awaited<ReturnType<typeof createClient>>

export const DEFAULT_TIME_ZONE = APP_TIME_ZONE

export type HistoryProject = { id: string; name: string; project_number: string | null }

export type HistoryAccess =
  | {
      ok: true
      supabase: Supabase
      session: StaffSession
      project: HistoryProject
      timeZone: string
      organizationName: string
      /** Export maps to the existing schedule-management permission (org_admin, project_manager). */
      canExport: boolean
    }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function getOrgTimeZone(supabase: Supabase, organizationId: string) {
  const { data } = await supabase
    .from('organization_settings')
    .select('timezone')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return isValidTimeZone(data?.timezone) ? data.timezone : DEFAULT_TIME_ZONE
}

/** Authenticates the caller and resolves the project inside their current organization. RLS still applies to every read. */
export async function resolveHistoryAccess(projectId: string): Promise<HistoryAccess> {
  if (!UUID_RE.test(projectId)) return { ok: false, status: 404, error: 'Project not found.' }

  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return { ok: false, status: 403, error: 'You do not have access to this schedule history.' }
  }

  const features = await getOrgFeatures(session.organizationId)
  if (!features.schedule) return { ok: false, status: 403, error: 'Construction scheduling is not enabled for this organization.' }

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, project_number')
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) return { ok: false, status: 404, error: 'Project not found.' }

  const timeZone = await getOrgTimeZone(supabase, session.organizationId)
  const organizationName =
    session.workspaces.find((w) => w.organizationId === session.organizationId)?.organizationName ?? 'Organization'

  return {
    ok: true,
    supabase,
    session: session as StaffSession,
    project,
    timeZone,
    organizationName,
    canExport: canManage(session.role),
  }
}

export async function getActorNames(organizationId: string) {
  const staff = await getStaffMembers(organizationId, ['org_admin', 'project_manager', 'builder_staff'])
  const map = new Map(staff.map((s) => [s.user_id, s.full_name || s.email || 'Team member']))
  return {
    options: [...map.entries()].map(([value, label]) => ({ value, label })),
    nameFor: (id: string | null) => (id ? (map.get(id) ?? 'Former team member') : null),
  }
}

type CountMode = 'exact' | undefined

function filteredQuery(supabase: Supabase, projectId: string, filters: HistoryFilters, timeZone: string, count?: CountMode, head = false) {
  let query = supabase
    .from('schedule_activity_events')
    .select(HISTORY_EVENT_COLUMNS, { count, head })
    .eq('project_id', projectId)

  if (filters.q) query = query.ilike('activity_name', likePattern(filters.q))
  if (filters.type) {
    const category = HISTORY_CATEGORIES[filters.type]
    query = query.eq('event_type', category.eventType)
    if (category.fields.length) {
      query = query.or(category.fields.map((f) => `changes.cs.{"${f}":{}}`).join(','))
    }
  }
  if (filters.from) query = query.gte('created_at', zonedMidnightUtc(filters.from, timeZone))
  if (filters.to) query = query.lt('created_at', zonedMidnightUtc(addDays(filters.to, 1), timeZone))
  if (filters.actor === SYSTEM_ACTOR) query = query.is('actor_id', null)
  else if (filters.actor) query = query.eq('actor_id', filters.actor)
  return query
}

export async function fetchRecentHistory(supabase: Supabase, projectId: string, limit: number) {
  const { data, error } = await supabase
    .from('schedule_activity_events')
    .select(HISTORY_EVENT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit)
  return { events: (data ?? []) as HistoryEventRow[], failed: Boolean(error) }
}

export async function fetchHistoryPage(
  supabase: Supabase,
  projectId: string,
  filters: HistoryFilters,
  timeZone: string,
  page: number,
  pageSize: number,
) {
  const from = (page - 1) * pageSize
  const { data, count, error } = await filteredQuery(supabase, projectId, filters, timeZone, 'exact')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) {
    // PostgREST answers 416 when a page is past the end; treat as an empty page.
    if (error.code === 'PGRST103') return { events: [] as HistoryEventRow[], total: count ?? 0 }
    throw new Error('history_query_failed')
  }
  return { events: (data ?? []) as HistoryEventRow[], total: count ?? 0 }
}

export async function countHistory(supabase: Supabase, projectId: string, filters: HistoryFilters, timeZone: string, upTo: string) {
  const { count, error } = await filteredQuery(supabase, projectId, filters, timeZone, 'exact', true).lte('created_at', upTo)
  if (error) throw new Error('history_count_failed')
  return count ?? 0
}

/**
 * Reads every matching event in bounded batches using a (created_at, id) cursor, capped at a snapshot instant so
 * events written mid-export cannot shift the window. History rows are immutable, so the cursor never skips rows.
 */
export async function fetchAllHistory(
  supabase: Supabase,
  projectId: string,
  filters: HistoryFilters,
  timeZone: string,
  upTo: string,
  maxRows: number,
) {
  const rows: HistoryEventRow[] = []
  const seen = new Set<string>()
  let cursor = upTo

  while (rows.length < maxRows) {
    const { data, error } = await filteredQuery(supabase, projectId, filters, timeZone)
      .lte('created_at', cursor)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(EXPORT_BATCH_SIZE)
    if (error) throw new Error('history_export_failed')

    const batch = (data ?? []) as HistoryEventRow[]
    let added = 0
    for (const row of batch) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      rows.push(row)
      added++
    }
    if (batch.length < EXPORT_BATCH_SIZE) break
    // A full batch sharing one timestamp cannot advance the cursor; stop rather than loop.
    if (added === 0) throw new Error('history_export_stalled')
    cursor = batch[batch.length - 1].created_at
  }
  return rows.slice(0, maxRows)
}
