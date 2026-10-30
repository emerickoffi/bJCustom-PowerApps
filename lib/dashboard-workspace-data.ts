import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getOrgToday } from '@/lib/daily-logs-data'
import { addIsoDays, AGENDA_WEEK_DAYS, buildAgenda, type Agenda, type AgendaActivity } from '@/lib/agenda'
import {
  compareHealth,
  computeProjectHealth,
  daysBetween,
  type ProjectHealth,
  type ProjectHealthSignals,
} from '@/lib/project-health'

type ProjectRef = { name: string } | { name: string }[] | null
const projectName = (p: ProjectRef) => (Array.isArray(p) ? p[0]?.name : p?.name) ?? null

const AGENDA_ROW_LIMIT = 200
const SIGNAL_ROW_LIMIT = 5000
const HEALTH_VISIBLE = 8
const REPORTED_DELAY_DAYS = 7

export type HealthProject = {
  id: string
  name: string
  project_number: string | null
  status: string
  health: ProjectHealth
}

type Features = {
  schedule: boolean
  daily_logs?: boolean
}

/** Today and this week from open, dated schedule activities on projects the user can see (RLS). */
export async function loadAgenda(orgId: string, scheduleEnabled: boolean): Promise<{ agenda: Agenda; today: string }> {
  const today = await getOrgToday(orgId)
  if (!scheduleEnabled) return { agenda: { today: [], week: [] }, today }
  const supabase = await createClient()
  const weekEnd = addIsoDays(today, AGENDA_WEEK_DAYS - 1)
  const { data } = await supabase
    .from('schedule_activities')
    .select('id, project_id, name, activity_type, status, planned_start, planned_end, projects!inner(name, archived_at)')
    .eq('organization_id', orgId)
    .is('projects.archived_at', null)
    .not('status', 'in', '(completed,skipped)')
    .lte('planned_start', weekEnd)
    .gte('planned_end', today)
    .order('planned_start', { ascending: true })
    .limit(AGENDA_ROW_LIMIT)

  const rows: AgendaActivity[] = (data ?? []).map((a) => ({
    id: a.id,
    project_id: a.project_id,
    projectName: projectName(a.projects as ProjectRef),
    name: a.name,
    activity_type: a.activity_type,
    status: a.status,
    planned_start: a.planned_start,
    planned_end: a.planned_end,
  }))
  return { agenda: buildAgenda(rows, today), today }
}

/**
 * Per-project health for active projects using batched, indexed lookups (no per-project queries).
 * Reads go through RLS, so counts only reflect records the signed-in user is authorized to see.
 */
export async function loadProjectHealth(
  orgId: string,
  userId: string,
  projectIds: string[],
  features: Features,
): Promise<{ projects: HealthProject[]; total: number; flagged: number }> {
  if (projectIds.length === 0) return { projects: [], total: 0, flagged: 0 }
  const supabase = await createClient()
  const today = await getOrgToday(orgId)
  const empty = Promise.resolve({ data: [] as never[] })

  const [projectsRes, activitiesRes, issuesRes, notificationsRes, logsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status')
      .eq('organization_id', orgId)
      .in('id', projectIds),
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('project_id, status, planned_end')
          .eq('organization_id', orgId)
          .in('project_id', projectIds)
          .limit(SIGNAL_ROW_LIMIT)
      : empty,
    supabase
      .from('project_issues')
      .select('project_id')
      .eq('organization_id', orgId)
      .in('project_id', projectIds)
      .in('status', ['open', 'in_progress'])
      .limit(SIGNAL_ROW_LIMIT),
    supabase
      .from('notifications')
      .select('project_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .eq('action_required', true)
      .is('read_at', null)
      .in('project_id', projectIds)
      .limit(SIGNAL_ROW_LIMIT),
    features.daily_logs
      ? supabase
          .from('daily_logs')
          .select('project_id')
          .eq('organization_id', orgId)
          .in('project_id', projectIds)
          .not('delay_description', 'is', null)
          .gte('log_date', addIsoDays(today, -REPORTED_DELAY_DAYS))
          .limit(SIGNAL_ROW_LIMIT)
      : empty,
  ])

  const signals = new Map<string, ProjectHealthSignals>()
  const get = (id: string) => {
    let s = signals.get(id)
    if (!s) {
      s = {
        scheduleEnabled: features.schedule,
        activityCount: 0,
        delayedCount: 0,
        overdueCount: 0,
        maxDaysOverdue: 0,
        openIssueCount: 0,
        pendingActionCount: 0,
        reportedDelayCount: 0,
      }
      signals.set(id, s)
    }
    return s
  }

  for (const a of (activitiesRes.data ?? []) as { project_id: string; status: string; planned_end: string | null }[]) {
    const s = get(a.project_id)
    s.activityCount++
    if (a.status === 'completed' || a.status === 'skipped') continue
    if (a.status === 'delayed') s.delayedCount++
    else if (a.planned_end && a.planned_end < today) {
      s.overdueCount++
      s.maxDaysOverdue = Math.max(s.maxDaysOverdue, daysBetween(a.planned_end, today))
    }
  }
  for (const r of (issuesRes.data ?? []) as { project_id: string }[]) get(r.project_id).openIssueCount++
  for (const r of (notificationsRes.data ?? []) as { project_id: string | null }[]) {
    if (r.project_id) get(r.project_id).pendingActionCount++
  }
  for (const r of (logsRes.data ?? []) as { project_id: string }[]) get(r.project_id).reportedDelayCount++

  const projects: HealthProject[] = ((projectsRes.data ?? []) as Omit<HealthProject, 'health'>[])
    .map((p) => ({ ...p, health: computeProjectHealth(get(p.id)) }))
    .sort((a, b) => compareHealth(a.health.level, b.health.level) || a.name.localeCompare(b.name))

  const flagged = projects.filter((p) => p.health.level === 'at_risk' || p.health.level === 'needs_attention').length
  return { projects: projects.slice(0, HEALTH_VISIBLE), total: projects.length, flagged }
}
