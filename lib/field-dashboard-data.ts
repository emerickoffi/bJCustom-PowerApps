import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { getRememberedJob, type JobSummary } from '@/lib/job-context'
import { getActionItems } from '@/lib/attention-data'
import { assignedProjectsFilter } from '@/lib/my-work'
import { todayIso } from '@/lib/schedule'
import { buildFieldQuickActions, type FieldQuickAction } from '@/lib/quick-actions'
import { fullName } from '@/lib/format'
import type { ActionItem } from '@/lib/action-items'
import type { FeatureMap } from '@/lib/feature-registry'
import type { ProjectStatus } from '@/lib/domain'
import type { StaffSession } from '@/lib/session'
import { buildUpcomingWork, type UpcomingWorkItem } from '@/lib/field-dashboard'

export type JobContact = { role: string; name: string; phone: string | null; email: string | null }

export type JobGlance = {
  status: ProjectStatus
  proposedStart: string | null
  targetCompletion: string | null
  completionDate: string | null
  homeowner: JobContact | null
  manager: JobContact | null
}

export type AssignedJob = JobSummary & { openActions: number }

export type FieldDashboardData = {
  job: JobSummary | null
  glance: JobGlance | null
  contacts: JobContact[]
  jobActions: ActionItem[]
  actionsTotalIsLowerBound: boolean
  quickActions: FieldQuickAction[]
  upcoming: UpcomingWorkItem[]
  recentLogs: { id: string; logDate: string; summary: string; hasDelays: boolean }[]
  assignedJobs: AssignedJob[]
  today: string
}

const UPCOMING_LIMIT = 6
const ASSIGNED_LIMIT = 8

/**
 * Everything the field dashboard needs, scoped to jobs the user is authorized for. The remembered job is
 * re-verified through RLS (getRememberedJob), and every per-job query filters by that verified id.
 */
export async function loadFieldDashboard(session: StaffSession, features: FeatureMap): Promise<FieldDashboardData> {
  const supabase = await createClient()
  const orgId = session.organizationId
  const manager = session.role === 'org_admin' || session.role === 'project_manager'
  const today = todayIso()

  const [job, memberRes, attention] = await Promise.all([
    getRememberedJob(orgId),
    supabase.from('project_members').select('project_id').eq('organization_id', orgId).eq('user_id', session.userId),
    getActionItems(orgId, session.userId, { manager, features }),
  ])

  const memberIds = ((memberRes.data ?? []) as { project_id: string }[]).map((r) => r.project_id)
  const { data: assignedRows } = await supabase
    .from('projects')
    .select('id, name, project_number, status, city, updated_at')
    .eq('organization_id', orgId)
    .is('archived_at', null)
    .or(assignedProjectsFilter(session.userId, memberIds))
    .order('updated_at', { ascending: false })
    .limit(ASSIGNED_LIMIT)

  const actionCounts = new Map<string, number>()
  for (const item of attention.items) {
    if (item.projectId) actionCounts.set(item.projectId, (actionCounts.get(item.projectId) ?? 0) + 1)
  }
  const assignedJobs: AssignedJob[] = (
    (assignedRows ?? []) as { id: string; name: string; project_number: string | null; status: string; city: string | null }[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    projectNumber: r.project_number,
    status: r.status as ProjectStatus,
    city: r.city,
    openActions: actionCounts.get(r.id) ?? 0,
  }))

  const empty: FieldDashboardData = {
    job: null,
    glance: null,
    contacts: [],
    jobActions: [],
    actionsTotalIsLowerBound: attention.totalIsLowerBound,
    quickActions: [],
    upcoming: [],
    recentLogs: [],
    assignedJobs,
    today,
  }
  if (!job) return empty

  const [projectRes, internalRes, activitiesRes, issuesRes, logsRes] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'status, archived_at, proposed_start_date, target_completion_date, completion_date, clients:primary_client_id(first_name, last_name, phone, email), manager:project_manager_id(full_name, phone, email)',
      )
      .eq('id', job.id)
      .eq('organization_id', orgId)
      .maybeSingle(),
    supabase.rpc('can_view_project_internal', { p_project: job.id }),
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, name, status, planned_start, planned_end, activity_type')
          .eq('project_id', job.id)
          .eq('organization_id', orgId)
          .not('status', 'in', '(completed,skipped)')
          .or(`planned_start.gte.${today},planned_end.gte.${today}`)
          .order('planned_start', { ascending: true, nullsFirst: false })
          .limit(UPCOMING_LIMIT)
      : Promise.resolve({ data: [] }),
    features.walkthroughs
      ? supabase
          .from('project_issues')
          .select('id, item_label, category, due_date, status')
          .eq('project_id', job.id)
          .eq('organization_id', orgId)
          .in('status', ['open', 'in_progress'])
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
          .limit(UPCOMING_LIMIT)
      : Promise.resolve({ data: [] }),
    features.daily_logs
      ? supabase
          .from('daily_logs')
          .select('id, log_date, work_performed, has_delays')
          .eq('project_id', job.id)
          .eq('organization_id', orgId)
          .order('log_date', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] }),
  ])

  type Person = { first_name?: string | null; last_name?: string | null; full_name?: string | null; phone: string | null; email: string | null }
  const project = projectRes.data as
    | {
        status: string
        archived_at: string | null
        proposed_start_date: string | null
        target_completion_date: string | null
        completion_date: string | null
        clients: Person | null
        manager: Person | null
      }
    | null
  if (!project) return empty

  const canViewInternal = Boolean(internalRes.data)
  const homeowner: JobContact | null = project.clients
    ? {
        role: 'Homeowner',
        name: fullName(project.clients.first_name, project.clients.last_name) || 'Homeowner',
        phone: project.clients.phone,
        email: project.clients.email,
      }
    : null
  const managerContact: JobContact | null = project.manager?.full_name
    ? { role: 'Project manager', name: project.manager.full_name, phone: project.manager.phone, email: project.manager.email }
    : null
  const contacts = [managerContact, homeowner].filter((c): c is JobContact => Boolean(c && (c.phone || c.email)))

  const upcoming = buildUpcomingWork({
    projectId: job.id,
    activities: (activitiesRes.data ?? []) as Parameters<typeof buildUpcomingWork>[0]['activities'],
    issues: (issuesRes.data ?? []) as Parameters<typeof buildUpcomingWork>[0]['issues'],
    today,
    limit: UPCOMING_LIMIT,
  })

  const recentLogs = canViewInternal
    ? ((logsRes.data ?? []) as { id: string; log_date: string; work_performed: string | null; has_delays: boolean | null }[]).map(
        (l) => ({ id: l.id, logDate: l.log_date, summary: l.work_performed?.trim() || 'No work summary recorded.', hasDelays: Boolean(l.has_delays) }),
      )
    : []

  return {
    ...empty,
    job,
    glance: {
      status: project.status as ProjectStatus,
      proposedStart: project.proposed_start_date,
      targetCompletion: project.target_completion_date,
      completionDate: project.completion_date,
      homeowner,
      manager: managerContact,
    },
    contacts,
    jobActions: attention.items.filter((i) => i.projectId === job.id),
    quickActions: buildFieldQuickActions({
      projectId: job.id,
      status: project.status,
      archived: Boolean(project.archived_at),
      role: session.role,
      features,
      canViewInternal,
      walkthroughs: features.walkthroughs,
      hasContacts: contacts.length > 0,
    }),
    upcoming,
    recentLogs,
  }
}
