import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeatureMap } from '@/lib/feature-registry'
import type { AssistantLink } from '@/lib/ai/assistant-scope'
import { briefingWindow, clip, type BriefingPeriod } from '@/lib/ai/briefing-window'

export { BRIEFING_PERIODS, type BriefingPeriod } from '@/lib/ai/briefing-window'

const MAX_PROJECTS = 200
const MAX_LOGS = 30
const MAX_ACTIVITIES = 25
const MAX_ASSIGNMENTS = 40
const MAX_LINKS = 8

type ProjectRow = { id: string; name: string; project_number: string | null; status: string | null }

type LogRow = {
  id: string
  project_id: string
  log_date: string
  status: 'draft' | 'finalized'
  work_performed: string | null
  progress_notes: string | null
  weather_impact: string | null
  delay_description: string | null
  delay_reason: string | null
  delay_impact: string | null
  corrective_actions: string | null
  safety_observations: string | null
  daily_log_crews: { trade: string; crew_size: number | null; company_name: string | null }[] | null
}

type ActivityRow = { id: string; project_id: string; name: string; status: string; planned_end: string | null; percent_complete: number | null }

type AssignmentRow = {
  id: string
  project_id: string
  scope_of_work: string | null
  subcontractor_companies: { company_name: string } | null
  schedule_activities: { name: string; status: string; percent_complete: number | null } | null
}

export type BriefingResult = { data: Record<string, unknown>; links: AssistantLink[] }

function matchProject(list: ProjectRow[], query: string): ProjectRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const exact = list.filter((p) => p.name.toLowerCase() === q || p.project_number?.toLowerCase() === q)
  return exact.length ? exact : list.filter((p) => p.name.toLowerCase().includes(q) || (p.project_number?.toLowerCase().includes(q) ?? false))
}

/**
 * Read-only briefing facts drawn from records the signed-in user can already see.
 * Every query runs through the user's own Supabase client, so row-level security
 * scopes results to their organization and authorized projects.
 */
export async function loadConstructionBriefing(
  supabase: SupabaseClient,
  features: FeatureMap,
  scope: { organizationId: string; projectId: string | null; projectQuery?: string | null; period: BriefingPeriod; today: string },
): Promise<BriefingResult> {
  const { from, to, label } = briefingWindow(scope.period, scope.today)

  const { data: projectData, error: projectError } = await supabase
    .from('projects')
    .select('id, name, project_number, status')
    .eq('organization_id', scope.organizationId)
    .order('name')
    .limit(MAX_PROJECTS)
  if (projectError) throw new Error(`projects: ${projectError.message}`)
  const projects = (projectData ?? []) as ProjectRow[]

  let selected: ProjectRow[]
  if (scope.projectId) {
    selected = projects.filter((p) => p.id === scope.projectId)
    if (!selected.length) return { data: { found: false, reason: 'The open project is not available to this user.' }, links: [] }
  } else if (scope.projectQuery?.trim()) {
    selected = matchProject(projects, scope.projectQuery)
    if (!selected.length) return { data: { found: false, reason: `No accessible project matches "${clip(scope.projectQuery, 80)}".` }, links: [] }
    if (selected.length > 1) {
      return { data: { found: false, ambiguous: true, candidates: selected.slice(0, 6).map((p) => p.name) }, links: [] }
    }
  } else {
    selected = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
  }

  const ids = selected.map((p) => p.id)
  const nameOf = new Map(selected.map((p) => [p.id, p.name]))
  const links: AssistantLink[] = []
  const addLink = (key: string, label: string, href: string) => {
    if (links.length < MAX_LINKS && !links.some((l) => l.key === key)) links.push({ key, label, href })
  }
  if (!ids.length) return { data: { found: true, scope: 'portfolio', period: label, note: 'No active projects are accessible.' }, links }

  const [logs, activities, assignments] = await Promise.all([
    features.daily_logs
      ? supabase
          .from('daily_logs')
          .select(
            'id, project_id, log_date, status, work_performed, progress_notes, weather_impact, delay_description, delay_reason, delay_impact, corrective_actions, safety_observations, daily_log_crews(trade, crew_size, company_name)',
          )
          .eq('organization_id', scope.organizationId)
          .in('project_id', ids)
          .gte('log_date', from)
          .lte('log_date', to)
          .order('log_date', { ascending: false })
          .limit(MAX_LOGS)
      : null,
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, project_id, name, status, planned_end, percent_complete')
          .eq('organization_id', scope.organizationId)
          .in('project_id', ids)
          .not('status', 'in', '(completed,skipped)')
          .or(`status.eq.delayed,planned_end.lt.${scope.today}`)
          .order('planned_end', { ascending: true, nullsFirst: false })
          .limit(MAX_ACTIVITIES)
      : null,
    features.subcontractors
      ? supabase
          .from('schedule_activity_assignments')
          .select('id, project_id, scope_of_work, subcontractor_companies(company_name), schedule_activities(name, status, percent_complete)')
          .eq('organization_id', scope.organizationId)
          .in('project_id', ids)
          .eq('status', 'active')
          .limit(MAX_ASSIGNMENTS)
      : null,
  ])

  const loadErrors: string[] = []
  if (logs?.error) loadErrors.push('daily logs')
  if (activities?.error) loadErrors.push('schedule')
  if (assignments?.error) loadErrors.push('subcontractor assignments')

  const logRows = (logs?.data ?? []) as unknown as LogRow[]
  const activityRows = (activities?.data ?? []) as ActivityRow[]
  const assignmentRows = (assignments?.data ?? []) as unknown as AssignmentRow[]

  const dailyLogs = logRows.map((l, i) => {
    const key = `daily_log_${i + 1}`
    addLink(key, `Daily log ${l.log_date} (${nameOf.get(l.project_id) ?? 'project'})`, `/projects/${l.project_id}/daily-logs/${l.id}`)
    return {
      link_key: key,
      project: nameOf.get(l.project_id),
      log_date: l.log_date,
      record_status: l.status === 'finalized' ? 'finalized (locked record)' : 'draft (may still change)',
      field_notes_untrusted: {
        work_performed: clip(l.work_performed),
        progress_notes: clip(l.progress_notes),
        weather_impact: clip(l.weather_impact),
        safety_observations: clip(l.safety_observations),
      },
      delay_reported: l.delay_description
        ? {
            description: clip(l.delay_description),
            reason: clip(l.delay_reason),
            impact: clip(l.delay_impact),
            corrective_actions: clip(l.corrective_actions),
          }
        : null,
      crews: (l.daily_log_crews ?? []).map((c) => ({ trade: c.trade, company: c.company_name, crew_size: c.crew_size })),
    }
  })

  const scheduleConcerns = activityRows.map((a) => ({
    project: nameOf.get(a.project_id),
    activity: a.name,
    status: a.status,
    planned_end: a.planned_end,
    percent_complete: a.percent_complete,
    overdue: !!a.planned_end && a.planned_end < scope.today,
  }))
  for (const id of new Set(activityRows.map((a) => a.project_id))) {
    addLink(`schedule_${ids.indexOf(id) + 1}`, `${nameOf.get(id)} schedule`, `/projects/${id}/schedule`)
  }

  const activeAssignments = assignmentRows.map((a) => ({
    project: nameOf.get(a.project_id),
    company: a.subcontractor_companies?.company_name ?? null,
    activity: a.schedule_activities?.name ?? null,
    activity_status_in_schedule: a.schedule_activities?.status ?? null,
    activity_percent_complete_in_schedule: a.schedule_activities?.percent_complete ?? null,
    scope_of_work_untrusted: clip(a.scope_of_work),
  }))

  const projectsWithLogs = new Set(logRows.map((l) => l.project_id))

  return {
    data: {
      found: true,
      scope: scope.projectId || scope.projectQuery ? 'project' : 'portfolio',
      period: label,
      window: { from, to },
      projects_in_scope: selected.map((p) => p.name),
      daily_logs: features.daily_logs ? dailyLogs : 'Daily Logs is turned off for this company.',
      daily_log_coverage: features.daily_logs
        ? {
            projects_with_logs: [...projectsWithLogs].map((id) => nameOf.get(id)),
            projects_without_logs_in_window: selected.filter((p) => !projectsWithLogs.has(p.id)).map((p) => p.name),
            note: 'No daily reporting expectation is configured, so a project without logs is not necessarily missing a required report.',
          }
        : null,
      schedule_concerns: features.schedule ? scheduleConcerns : 'Schedule is turned off for this company.',
      active_subcontractor_assignments: features.subcontractors ? activeAssignments : 'Subcontractors is turned off for this company.',
      financial: 'Not included: no recorded actual-cost data is available to compare against budgets.',
      data_load_errors: loadErrors,
      truncated: {
        daily_logs: logRows.length >= MAX_LOGS,
        schedule_concerns: activityRows.length >= MAX_ACTIVITIES,
        assignments: assignmentRows.length >= MAX_ASSIGNMENTS,
      },
      available_source_links: links.map((l) => ({ key: l.key, label: l.label })),
    },
    links,
  }
}
