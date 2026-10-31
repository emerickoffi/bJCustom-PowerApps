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
import { evaluateScheduleRisk, isEvaluated, isScheduleRisk, type ScheduleRisk } from '@/lib/schedule-risk'
import { available, disabled, unavailable, type Metric } from '@/lib/financial-metrics'

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

/** Today and the next `days` days from open, dated schedule activities on projects the user can see (RLS). */
export async function loadAgenda(
  orgId: string,
  scheduleEnabled: boolean,
  days: number = AGENDA_WEEK_DAYS,
): Promise<{ agenda: Agenda; today: string }> {
  const today = await getOrgToday(orgId)
  if (!scheduleEnabled) return { agenda: { today: [], week: [] }, today }
  const supabase = await createClient()
  const weekEnd = addIsoDays(today, days - 1)
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
  return { agenda: buildAgenda(rows, today, days), today }
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
): Promise<{
  projects: HealthProject[]
  byId: Map<string, ProjectHealth>
  total: number
  flagged: number
  scheduleRisk: ScheduleRiskSummary
}> {
  if (projectIds.length === 0) {
    return {
      projects: [],
      byId: new Map(),
      total: 0,
      flagged: 0,
      scheduleRisk: features.schedule
        ? available({ atRisk: 0, critical: 0, evaluated: 0, headline: null, projectId: null })
        : disabled('Schedule module is off'),
    }
  }
  const supabase = await createClient()
  const today = await getOrgToday(orgId)
  const empty = Promise.resolve({ data: [] as never[] })

  const [projectsRes, activitiesRes, issuesRes, notificationsRes, logsRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status, proposed_start_date')
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
        datedActivityCount: 0,
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
    if (a.planned_end) s.datedActivityCount++
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

  const rows = (projectsRes.data ?? []) as (Omit<HealthProject, 'health'> & { proposed_start_date: string | null })[]
  const scheduleReadable = features.schedule && !('error' in activitiesRes && activitiesRes.error) && !projectsRes.error
  const risks = new Map<string, ScheduleRisk>()
  if (scheduleReadable) {
    for (const p of rows) {
      const s = get(p.id)
      const risk = evaluateScheduleRisk({ ...s, status: p.status, proposedStartDate: p.proposed_start_date }, today)
      risks.set(p.id, risk)
      if (risk.level === 'warning' && s.delayedCount === 0 && s.overdueCount === 0) s.startRiskReason = risk.reason
    }
  }

  const projects: HealthProject[] = rows
    .map(({ proposed_start_date: _proposedStart, ...p }) => ({ ...p, health: computeProjectHealth(get(p.id)) }))
    .sort((a, b) => compareHealth(a.health.level, b.health.level) || a.name.localeCompare(b.name))

  const flagged = projects.filter((p) => p.health.level === 'at_risk' || p.health.level === 'needs_attention').length
  return {
    projects: projects.slice(0, HEALTH_VISIBLE),
    byId: new Map(projects.map((p) => [p.id, p.health])),
    total: projects.length,
    flagged,
    scheduleRisk: summarizeScheduleRisk(features.schedule, scheduleReadable, rows, risks),
  }
}

export type ScheduleRiskSummary = Metric<{
  atRisk: number
  critical: number
  evaluated: number
  headline: string | null
  /** The single at-risk project, when exactly one, so the card can deep-link to its schedule. */
  projectId: string | null
}>

function summarizeScheduleRisk(
  enabled: boolean,
  readable: boolean,
  rows: { id: string; name: string }[],
  risks: Map<string, ScheduleRisk>,
): ScheduleRiskSummary {
  if (!enabled) return disabled('Schedule module is off')
  if (!readable) return unavailable('Schedule records could not be loaded')
  const flagged = rows
    .flatMap((p) => {
      const risk = risks.get(p.id)
      return risk && isScheduleRisk(risk.level) ? [{ p, risk }] : []
    })
    .sort((a, b) => (a.risk.level === b.risk.level ? 0 : a.risk.level === 'critical' ? -1 : 1))
  const evaluated = rows.filter((p) => {
    const risk = risks.get(p.id)
    return !!risk && isEvaluated(risk.level)
  }).length
  const top = flagged[0]
  return available({
    atRisk: flagged.length,
    critical: flagged.filter((f) => f.risk.level === 'critical').length,
    evaluated,
    headline: top ? `${top.p.name}: ${top.risk.reason.charAt(0).toLowerCase()}${top.risk.reason.slice(1)}` : null,
    projectId: flagged.length === 1 ? top.p.id : null,
  })
}

const WARRANTY_ROW_LIMIT = 200
const WARRANTY_CLAIM_LIMIT = 1000

export type WarrantyOverviewRow = {
  projectId: string
  projectName: string
  projectNumber: string | null
  stage: string
  coverageName: string | null
  milestoneLabel: string | null
  milestoneDueOn: string | null
  openClaims: number
}

export type WarrantyOverview = Metric<{ rows: WarrantyOverviewRow[]; total: number; openClaims: number }>

type RefRow<T> = T | T[] | null
const one = <T,>(v: RefRow<T>) => (Array.isArray(v) ? (v[0] ?? null) : v)

/**
 * Non-archived warranties with their current (next unreached) milestone and open claim counts, read through RLS.
 * Rows are sorted by the soonest verified milestone; warranties without one sort last.
 */
export async function loadWarrantyOverview(orgId: string, enabled: boolean): Promise<WarrantyOverview> {
  if (!enabled) return disabled('Warranty module is off')
  const supabase = await createClient()
  const [warrantiesRes, claimsRes] = await Promise.all([
    supabase
      .from('project_warranties')
      .select(
        'project_id, stage, projects(name, project_number), current:warranty_milestones!project_warranties_current_milestone_fk(coverage_name, stage_label, due_on, reached_at)',
      )
      .eq('organization_id', orgId)
      .neq('stage', 'archived')
      .limit(WARRANTY_ROW_LIMIT),
    supabase
      .from('warranty_claims')
      .select('project_id')
      .eq('organization_id', orgId)
      .neq('status', 'closed')
      .limit(WARRANTY_CLAIM_LIMIT),
  ])
  if (warrantiesRes.error) return unavailable('Warranty records could not be loaded')

  const claims = new Map<string, number>()
  const claimsReadable = !claimsRes.error
  for (const c of (claimsRes.data ?? []) as { project_id: string }[]) claims.set(c.project_id, (claims.get(c.project_id) ?? 0) + 1)

  type Row = {
    project_id: string
    stage: string
    projects: RefRow<{ name: string; project_number: string | null }>
    current: RefRow<{ coverage_name: string; stage_label: string; due_on: string; reached_at: string | null }>
  }
  const rows = ((warrantiesRes.data ?? []) as unknown as Row[]).map((w): WarrantyOverviewRow => {
    const project = one(w.projects)
    const current = one(w.current)
    const pending = current && !current.reached_at ? current : null
    return {
      projectId: w.project_id,
      projectName: project?.name ?? 'Project',
      projectNumber: project?.project_number ?? null,
      stage: w.stage,
      coverageName: pending?.coverage_name ?? null,
      milestoneLabel: pending?.stage_label ?? null,
      milestoneDueOn: pending?.due_on ?? null,
      openClaims: claimsReadable ? (claims.get(w.project_id) ?? 0) : 0,
    }
  })
  rows.sort((a, b) => {
    if (a.openClaims !== b.openClaims) return b.openClaims - a.openClaims
    if (a.milestoneDueOn && b.milestoneDueOn) return a.milestoneDueOn.localeCompare(b.milestoneDueOn)
    if (a.milestoneDueOn) return -1
    if (b.milestoneDueOn) return 1
    return a.projectName.localeCompare(b.projectName)
  })
  const openClaims = rows.reduce((sum, r) => sum + r.openClaims, 0)
  return available({ rows, total: rows.length, openClaims })
}
