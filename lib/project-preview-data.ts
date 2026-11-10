import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getStaffMembers } from '@/lib/queries'
import { signMediaPaths } from '@/lib/media'
import { buildProjectNextActions } from '@/lib/next-actions'
import { dailyLogPath, isDailyLogStatus } from '@/lib/daily-logs'
import { formatAddress, formatDate } from '@/lib/format'
import {
  PREVIEW_PHOTO_LIMIT,
  dailyLogSummary,
  isPastPlannedFinish,
  lateActivities,
  pickNextActivity,
  plannedLabel,
  type PreviewActivityRow,
  type PreviewLatestUpdate,
  type PreviewNextActivity,
  type ProjectPreview,
} from '@/lib/project-preview'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type ProjectPreviewResult =
  | { ok: true; preview: ProjectPreview }
  | { ok: false; status: 401 | 403 | 404; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND: ProjectPreviewResult = { ok: false, status: 404, error: 'Project not found.' }

type ProjectRow = {
  id: string
  status: string
  project_manager_id: string | null
  target_completion_date: string | null
  completion_date: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

/**
 * Everything the Projects list preview shows for one project. The project is resolved inside the caller's current
 * organization and every read runs as the signed-in user, so row-level security applies exactly as on the Overview.
 * Throws only when the project itself cannot be read; section-level failures are reported per section.
 */
export async function loadProjectPreview(projectId: string): Promise<ProjectPreviewResult> {
  if (!UUID.test(projectId)) return NOT_FOUND

  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return { ok: false, status: 403, error: 'You do not have access to this project.' }
  }
  const organizationId = session.organizationId

  const supabase = await createClient()
  const [projectRes, features] = await Promise.all([
    supabase
      .from('projects')
      .select(
        'id, status, project_manager_id, target_completion_date, completion_date, address_line1, address_line2, city, state, postal_code',
      )
      .eq('id', projectId)
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .maybeSingle(),
    getOrgFeatures(organizationId),
  ])
  if (projectRes.error) throw new Error('project_preview_failed')
  const project = projectRes.data as ProjectRow | null
  if (!project) return NOT_FOUND

  const manager = canManage(session.role)
  const signing = features.documents && features.e_signatures
  const skipped = Promise.resolve(null)
  const [activitiesRes, issuesRes, estimatesRes, signaturesRes, staff, internalRes] = await Promise.all([
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, name, status, planned_start, planned_end, activity_type, assigned_to')
          .eq('project_id', project.id)
          .order('sort_order')
      : skipped,
    features.walkthroughs
      ? supabase
          .from('project_issues')
          .select('id, item_label', { count: 'exact' })
          .eq('project_id', project.id)
          .neq('status', 'closed')
          .order('reported_at', { ascending: true })
          .limit(1)
      : skipped,
    features.estimates && manager
      ? supabase.from('estimates').select('id').eq('project_id', project.id).eq('status', 'internal_review').order('created_at')
      : skipped,
    signing
      ? supabase
          .from('signature_requests')
          .select('document_id, status, created_at')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })
          .limit(200)
      : skipped,
    getStaffMembers(organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    features.daily_logs ? supabase.rpc('can_view_project_internal', { p_project: project.id }) : skipped,
  ])

  const nameFor = (userId: string | null) => {
    if (!userId) return null
    // The viewer is always on the staff list, so an empty list means the lookup itself failed.
    if (!staff.length) return 'Name unavailable'
    const member = staff.find((s) => s.user_id === userId)
    return member ? member.full_name || member.email || 'Team member' : 'Former team member'
  }

  const activities = (activitiesRes?.data ?? []) as PreviewActivityRow[]
  const late = lateActivities(activities)
  const actions = buildProjectNextActions({
    projectId: project.id,
    canManage: manager,
    features: {
      schedule: features.schedule,
      estimates: features.estimates,
      documents: features.documents,
      e_signatures: features.e_signatures,
      walkthroughs: features.walkthroughs,
      warranty: features.warranty,
    },
    status: project.status,
    scope: 'all',
    isProjectManager: project.project_manager_id === session.userId,
    lateActivityCount: late.length,
    firstLateActivity: late[0]
      ? { name: late[0].name, dueLabel: late[0].planned_end ? `Due ${formatDate(late[0].planned_end)}` : null }
      : null,
    reviewEstimateIds: ((estimatesRes?.data ?? []) as { id: string }[]).map((e) => e.id),
    signatureRequests: (signaturesRes?.data ?? []) as { document_id: string; status: string; created_at: string }[],
    openIssueCount: issuesRes?.error ? 0 : (issuesRes?.count ?? 0),
    firstOpenIssueId: issuesRes?.data?.[0]?.id ?? null,
    firstOpenIssueLabel: issuesRes?.data?.[0]?.item_label ?? null,
  })

  const scheduleHref = `/projects/${project.id}/schedule`
  let nextActivity: PreviewNextActivity
  if (!features.schedule) nextActivity = { state: 'off', scheduleHref }
  else if (activitiesRes?.error) nextActivity = { state: 'error', scheduleHref }
  else {
    const picked = pickNextActivity(activities)
    nextActivity =
      picked.state === 'ready'
        ? {
            state: 'ready',
            scheduleHref,
            href: `${scheduleHref}?activity=${encodeURIComponent(picked.activity.id)}`,
            name: picked.activity.name,
            milestone: picked.activity.activity_type === 'milestone',
            plannedLabel: plannedLabel(picked.activity),
            status: picked.activity.status,
            overdue: isPastPlannedFinish(picked.activity),
            assigneeName: nameFor(picked.activity.assigned_to),
          }
        : { state: picked.state, scheduleHref }
  }

  let latestUpdate: PreviewLatestUpdate
  if (!features.daily_logs) latestUpdate = { state: 'off' }
  else if (!internalRes || internalRes.error) latestUpdate = { state: 'error' }
  else if (!internalRes.data) latestUpdate = { state: 'off' }
  else latestUpdate = await loadLatestUpdate(supabase, project.id)

  const completed = project.status === 'completed'
  const address = formatAddress(project)
  const date = completed ? project.completion_date : project.target_completion_date

  return {
    ok: true,
    preview: {
      id: project.id,
      summary: {
        address: address === '—' ? null : address,
        managerName: nameFor(project.project_manager_id),
        dateLabel: completed ? 'Completed' : 'Target completion',
        dateValue: date ? formatDate(date) : null,
      },
      attention: {
        items: actions.items,
        hiddenCount: actions.hiddenCount,
        incomplete: Boolean(activitiesRes?.error || issuesRes?.error || estimatesRes?.error || signaturesRes?.error),
      },
      nextActivity,
      latestUpdate,
    },
  }
}

async function loadLatestUpdate(supabase: Supabase, projectId: string): Promise<PreviewLatestUpdate> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('id, log_date, status, work_performed, progress_notes, weather_conditions')
    .eq('project_id', projectId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) return { state: 'error' }
  const log = data?.[0]
  if (!log || !isDailyLogStatus(log.status)) return { state: 'empty' }

  const dateLabel = formatDate(log.log_date)
  const { data: photoRows, count } = await supabase
    .from('daily_log_photos')
    .select('id, storage_path, caption', { count: 'exact' })
    .eq('daily_log_id', log.id)
    .order('created_at')
    .limit(PREVIEW_PHOTO_LIMIT)
  const rows = (photoRows ?? []) as { id: string; storage_path: string; caption: string | null }[]
  const urls = await signMediaPaths(rows.map((p) => p.storage_path))
  const photos = rows.flatMap((p) => {
    const url = urls.get(p.storage_path)
    return url ? [{ id: p.id, url, alt: p.caption?.trim() || `Photo from the ${dateLabel} daily log` }] : []
  })

  return {
    state: 'ready',
    href: dailyLogPath(projectId, log.id),
    dateLabel,
    draft: log.status === 'draft',
    summary: dailyLogSummary(log),
    photos,
    morePhotos: Math.max(0, (count ?? rows.length) - rows.length),
  }
}
