import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_PROJECT_STATUSES } from '@/lib/domain'
import { getStaffMembers } from '@/lib/queries'
import { buildScheduleReport, type ReportActivity, type ScheduleReport } from '@/lib/schedule-report'

const LIMIT = 5000

/** The company's own date (its time zone), the same "today" the Warranty and Schedule pages use. */
export async function orgToday(organizationId: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('org_today', { p_org: organizationId })
  return (data as string | null) ?? new Date().toISOString().slice(0, 10)
}

/** Open activities on active, non-archived jobs, with who is doing them. Reads go through RLS. */
export async function loadScheduleReport(organizationId: string, lookaheadWeeks: number): Promise<ScheduleReport & { truncated: boolean }> {
  const supabase = await createClient()
  const [today, { data, error }, staff] = await Promise.all([
    orgToday(organizationId),
    supabase
      .from('schedule_activities')
      .select(
        'id, project_id, name, phase, activity_type, status, planned_start, planned_end, percent_complete, delay_reason, assigned_to, projects!inner(name, status, archived_at)',
      )
      .eq('organization_id', organizationId)
      .not('status', 'in', '(completed,skipped)')
      .is('projects.archived_at', null)
      .in('projects.status', ACTIVE_PROJECT_STATUSES)
      .limit(LIMIT),
    getStaffMembers(organizationId),
  ])
  if (error) throw new Error(`Schedule could not be loaded: ${error.message}`)

  type Row = {
    id: string
    project_id: string
    name: string
    phase: string
    activity_type: string
    status: string
    planned_start: string | null
    planned_end: string | null
    percent_complete: number | string
    delay_reason: string | null
    assigned_to: string | null
    projects: { name: string } | null
  }
  const rows = (data ?? []) as unknown as Row[]
  const people = new Map(staff.map((s) => [s.user_id, s.full_name || s.email || 'Team member']))

  const companies = new Map<string, string[]>()
  const ids = rows.map((r) => r.id)
  for (let i = 0; i < ids.length; i += 500) {
    const { data: assigned } = await supabase
      .from('schedule_activity_assignments')
      .select('schedule_activity_id, subcontractor_companies(company_name)')
      .eq('status', 'active')
      .in('schedule_activity_id', ids.slice(i, i + 500))
    for (const a of (assigned ?? []) as unknown as { schedule_activity_id: string; subcontractor_companies: { company_name: string } | null }[]) {
      const name = a.subcontractor_companies?.company_name
      if (name) companies.set(a.schedule_activity_id, [...(companies.get(a.schedule_activity_id) ?? []), name])
    }
  }

  const activities: ReportActivity[] = rows.map((r) => ({
    id: r.id,
    project_id: r.project_id,
    project_name: r.projects?.name ?? 'Project',
    name: r.name,
    phase: r.phase,
    activity_type: r.activity_type,
    status: r.status,
    planned_start: r.planned_start,
    planned_end: r.planned_end,
    percent_complete: Number(r.percent_complete ?? 0),
    delay_reason: r.delay_reason,
    who: [...(r.assigned_to && people.get(r.assigned_to) ? [people.get(r.assigned_to)!] : []), ...(companies.get(r.id) ?? [])],
  }))
  return { ...buildScheduleReport(activities, today, lookaheadWeeks), truncated: rows.length >= LIMIT }
}
