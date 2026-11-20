import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getOrgTimeZone } from '@/lib/daily-logs-data'
import { todayInTimeZone } from '@/lib/daily-logs'
import { TIME_ENTRY_COLUMNS, weekStart, zonedDayRange, type TimeEntry } from '@/lib/time-tracking'

export type TimeProject = { id: string; name: string; project_number: string | null }
export type TeamMember = { user_id: string; name: string; role: string }

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function normalize(row: Record<string, unknown>): TimeEntry {
  return {
    ...(row as unknown as TimeEntry),
    break_minutes: Number(row.break_minutes ?? 0),
    worked_minutes: n(row.worked_minutes),
    hourly_cost_cents: n(row.hourly_cost_cents),
    cost_cents: n(row.cost_cents),
  }
}

/** Company time zone, today, and Monday of the requested (or current) week. */
export const getTimeCalendar = cache(async (organizationId: string, requestedWeek?: string) => {
  const timeZone = await getOrgTimeZone(organizationId)
  const today = todayInTimeZone(timeZone)
  const week = weekStart(requestedWeek && /^\d{4}-\d{2}-\d{2}$/.test(requestedWeek) ? requestedWeek : today)
  return { timeZone, today, week }
})

/** Active projects this person can charge time to (RLS: managers see all, staff see assigned ones). */
export const getTimeProjects = cache(async (organizationId: string): Promise<TimeProject[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projects')
    .select('id, name, project_number')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('name')
    .limit(500)
  return (data ?? []) as TimeProject[]
})

export async function getOpenEntry(userId: string): Promise<TimeEntry | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('time_entries').select(TIME_ENTRY_COLUMNS).eq('user_id', userId).eq('status', 'open').maybeSingle()
  return data ? normalize(data) : null
}

export async function listEntries(opts: {
  organizationId: string
  from: string
  to: string
  timeZone: string
  userId?: string
  status?: string
  projectId?: string
  limit?: number
}): Promise<TimeEntry[]> {
  const { start, end } = zonedDayRange(opts.from, opts.to, opts.timeZone)
  const supabase = await createClient()
  let q = supabase
    .from('time_entries')
    .select(TIME_ENTRY_COLUMNS)
    .eq('organization_id', opts.organizationId)
    .gte('started_at', start)
    .lt('started_at', end)
    .order('started_at', { ascending: true })
    .limit(opts.limit ?? 2000)
  if (opts.userId) q = q.eq('user_id', opts.userId)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.projectId) q = q.eq('project_id', opts.projectId)
  const { data } = await q
  return (data ?? []).map(normalize)
}

/** Entries waiting for a decision from any week (managers' inbox). */
export async function countPendingForReview(organizationId: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from('time_entries')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
  return count ?? 0
}

/** Staff members (not homeowners) with display names. */
export const getTeamMembers = cache(async (organizationId: string): Promise<TeamMember[]> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_memberships')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .neq('role', 'client')
  const ids = (data ?? []).map((m) => m.user_id as string)
  if (!ids.length) return []
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
  const names = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team member') as string]))
  return (data ?? [])
    .map((m) => ({ user_id: m.user_id as string, role: m.role as string, name: names.get(m.user_id as string) ?? 'Team member' }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

/** Hourly labor cost per person, in cents (managers and admins only; RLS). */
export async function getLaborRates(organizationId: string): Promise<Map<string, number>> {
  const supabase = await createClient()
  const { data } = await supabase.from('labor_rates').select('user_id, hourly_cost_cents').eq('organization_id', organizationId)
  return new Map((data ?? []).map((r) => [r.user_id as string, Number(r.hourly_cost_cents)]))
}

/** Approved labor cost per cost code for one project (job costing). Null when time tracking isn't installed. */
export async function getApprovedLabor(projectId: string): Promise<{ category: string; cost_cents: number; minutes: number }[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('time_entries')
    .select('cost_category, cost_cents, worked_minutes')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .limit(10000)
  if (error) return null
  const by = new Map<string, { category: string; cost_cents: number; minutes: number }>()
  for (const r of data ?? []) {
    const row = by.get(r.cost_category) ?? { category: r.cost_category, cost_cents: 0, minutes: 0 }
    row.cost_cents += Number(r.cost_cents ?? 0)
    row.minutes += Number(r.worked_minutes ?? 0)
    by.set(r.cost_category, row)
  }
  return [...by.values()]
}
