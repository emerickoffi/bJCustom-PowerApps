import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getStaffMembers } from '@/lib/queries'
import { signMediaPaths } from '@/lib/media'
import { undatedOpenActivityCount } from '@/lib/schedule'
import { dailyLogPath, isDailyLogStatus } from '@/lib/daily-logs'
import { directoryClosedReason } from '@/lib/domain'
import { personName } from '@/lib/contacts'
import { formatAddress, formatDate } from '@/lib/format'
import { loadProjectHomeowners } from '@/lib/project-homeowners-data'
import { loadDirectoryForAssignment, type DirectoryRow } from '@/lib/directory-assignment-data'
import { RFI_LIST_COLUMNS, isRfiSetupError, rfisPath } from '@/lib/rfis'
import {
  PREVIEW_PHOTO_LIMIT,
  activityAssignees,
  buildSubcontractorEntries,
  dailyLogSummary,
  isPastPlannedFinish,
  pickHomeowners,
  pickNextActivity,
  pickPendingQuestions,
  plannedLabel,
  type PendingQuestionRow,
  type PreviewActivityRow,
  type PreviewHomeowners,
  type PreviewLatestUpdate,
  type PreviewNextActivity,
  type PreviewPerson,
  type PreviewQuestions,
  type PreviewSubcontractors,
  type ProjectPreview,
} from '@/lib/project-preview'

type Supabase = Awaited<ReturnType<typeof createClient>>

type Denied = { ok: false; status: 401 | 403 | 404; error: string }

export type ProjectPreviewResult = { ok: true; preview: ProjectPreview } | Denied

export type AssignmentDirectory = {
  projectId: string
  rows: DirectoryRow[]
  /** Subcontractor management is on, so a new company can be created and assigned. */
  canCreateCompany: boolean
}

export type AssignmentDirectoryResult =
  | { ok: true; directory: AssignmentDirectory }
  | Denied
  /** The project exists but cannot take assignments; `error` says why. */
  | { ok: false; status: 409; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOT_FOUND: Denied = { ok: false, status: 404, error: 'Project not found.' }
const MISSING_TABLE = new Set(['PGRST205', '42P01'])
const PENDING_QUESTION_SCAN = 100

type ProjectRow = {
  id: string
  status: string
  archived_at: string | null
  project_manager_id: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

/**
 * The selected project, resolved inside the caller's current organization. Every later read runs as the
 * signed-in user, so row-level security applies exactly as on the project's own pages. Throws only when the
 * project itself cannot be read.
 */
async function resolvePreviewProject(projectId: string) {
  if (!UUID.test(projectId)) return NOT_FOUND

  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' } satisfies Denied
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return { ok: false, status: 403, error: 'You do not have access to this project.' } satisfies Denied
  }
  const organizationId = session.organizationId

  const supabase = await createClient()
  const [projectRes, features] = await Promise.all([
    supabase
      .from('projects')
      .select('id, status, archived_at, project_manager_id, address_line1, address_line2, city, state, postal_code')
      .eq('id', projectId)
      .eq('organization_id', organizationId)
      .is('archived_at', null)
      .maybeSingle(),
    getOrgFeatures(organizationId),
  ])
  if (projectRes.error) throw new Error('project_preview_failed')
  const project = projectRes.data as ProjectRow | null
  if (!project) return NOT_FOUND

  return { ok: true as const, supabase, organizationId, features, project, manager: canManage(session.role) }
}

/** Everything the Projects list preview shows for one project. Section-level failures are reported per section. */
export async function loadProjectPreview(projectId: string): Promise<ProjectPreviewResult> {
  const resolved = await resolvePreviewProject(projectId)
  if (!resolved.ok) return resolved
  const { supabase, organizationId, features, project, manager } = resolved

  const skipped = Promise.resolve(null)
  const [activitiesRes, staff, internalRes, homeowners, subcontractors] = await Promise.all([
    features.schedule
      ? supabase
          .from('schedule_activities')
          .select('id, name, status, planned_start, planned_end, activity_type, assigned_to')
          .eq('project_id', project.id)
          .order('sort_order')
      : skipped,
    getStaffMembers(organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    features.daily_logs || features.rfis ? supabase.rpc('can_view_project_internal', { p_project: project.id }) : skipped,
    loadHomeowners(supabase, organizationId, project.id),
    loadSubcontractors(supabase, organizationId, project.id, Boolean(features.subcontractors), manager),
  ])

  const staffPerson = (userId: string | null): PreviewPerson | null => {
    if (!userId) return null
    // The viewer is always on the staff list, so an empty list means the lookup itself failed.
    if (!staff.length) return { name: 'Name unavailable', detail: null, email: null, phone: null }
    const member = staff.find((s) => s.user_id === userId)
    return member
      ? { name: member.full_name || member.email || 'Team member', detail: null, email: member.email, phone: null }
      : { name: 'Former team member', detail: null, email: null, phone: null }
  }

  // `can_view_project_internal` gates daily logs and questions alike; a failed check is not the same as "no access".
  const internalState = !internalRes || internalRes.error ? 'error' : internalRes.data ? 'allowed' : 'denied'
  const gated = <T,>(enabled: boolean, load: () => Promise<T>, off: T, error: T) =>
    !enabled ? Promise.resolve(off) : internalState === 'error' ? Promise.resolve(error) : internalState === 'denied' ? Promise.resolve(off) : load()

  const [nextActivity, latestUpdate, questions] = await Promise.all([
    loadNextActivity(supabase, project.id, {
      enabled: features.schedule,
      rows: (activitiesRes?.data ?? []) as PreviewActivityRow[],
      failed: Boolean(activitiesRes?.error),
      companies: Boolean(features.subcontractors) && manager,
      personName: (userId) => staffPerson(userId)?.name ?? null,
    }),
    gated<PreviewLatestUpdate>(features.daily_logs, () => loadLatestUpdate(supabase, project.id), { state: 'off' }, { state: 'error' }),
    gated<PreviewQuestions>(Boolean(features.rfis), () => loadPendingQuestions(supabase, project.id), { state: 'off' }, { state: 'error' }),
  ])

  const address = formatAddress(project)
  const closedReason = directoryClosedReason(project.status, project.archived_at)

  return {
    ok: true,
    preview: {
      id: project.id,
      address: address === '—' ? null : address,
      people: {
        manager: staffPerson(project.project_manager_id),
        homeowners,
        subcontractors,
        canAssign: manager && !closedReason && subcontractors.state !== 'unavailable',
        assignNote: manager ? closedReason : null,
        peopleHref: `/projects/${project.id}/contacts`,
      },
      nextActivity,
      latestUpdate,
      questions,
    },
  }
}

/**
 * The directory the assignment view picks from, loaded only when that view opens. The same people who may
 * submit an assignment may load it: administrators and project managers, for a project that still takes them.
 */
export async function loadAssignmentDirectory(projectId: string): Promise<AssignmentDirectoryResult> {
  const resolved = await resolvePreviewProject(projectId)
  if (!resolved.ok) return resolved
  const { supabase, organizationId, features, project, manager } = resolved
  if (!manager) return { ok: false, status: 403, error: 'Your role does not allow you to assign contacts to projects.' }

  const closedReason = directoryClosedReason(project.status, project.archived_at)
  if (closedReason) return { ok: false, status: 409, error: closedReason }

  const directory = await loadDirectoryForAssignment(supabase, organizationId, project.id, Boolean(features.subcontractors))
  if (directory.availability !== 'ready') {
    return { ok: false, status: 409, error: 'The business directory isn’t set up for this organization yet.' }
  }
  return { ok: true, directory: { projectId: project.id, rows: directory.rows, canCreateCompany: Boolean(features.subcontractors) } }
}

async function loadHomeowners(supabase: Supabase, organizationId: string, projectId: string): Promise<PreviewHomeowners> {
  try {
    const homeowners = await loadProjectHomeowners(supabase, organizationId, projectId)
    return homeowners.loadFailed ? { state: 'error' } : { state: 'ready', ...pickHomeowners(homeowners.groups) }
  } catch {
    return { state: 'error' }
  }
}

type PersonAssignmentRow = {
  person_id: string
  project_role: string | null
  person: { first_name: string; last_name: string } | null
  via: { company: { company_name: string; subcontractor_company_id: string | null } | null } | null
}

type CompanyAssignmentRow = {
  subcontractor_company_id: string
  company: { company_name: string; trade: string | null } | null
}

/**
 * Active assignments only, by the rules the People page uses: a directory person whose project association is
 * `active`, and a subcontractor company whose assignment has not ended. Company assignments never bring the
 * company's people with them.
 */
async function loadSubcontractors(
  supabase: Supabase,
  organizationId: string,
  projectId: string,
  subcontractorsEnabled: boolean,
  manager: boolean,
): Promise<PreviewSubcontractors> {
  const [peopleRes, companiesRes] = await Promise.all([
    supabase
      .from('business_person_projects')
      .select(
        'person_id, project_role, person:business_people(first_name, last_name), via:business_person_companies!person_company_id(company:business_companies(company_name, subcontractor_company_id))',
      )
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .eq('status', 'active'),
    subcontractorsEnabled
      ? supabase
          .from('subcontractor_project_assignments')
          .select('subcontractor_company_id, company:subcontractor_companies(company_name, trade)')
          .eq('organization_id', organizationId)
          .eq('project_id', projectId)
          .is('ended_at', null)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (MISSING_TABLE.has(peopleRes.error?.code ?? '')) return { state: 'unavailable' }
  if (peopleRes.error || companiesRes.error) return { state: 'error' }

  const people = (peopleRes.data ?? []) as unknown as PersonAssignmentRow[]
  const companies = (companiesRes.data ?? []) as unknown as CompanyAssignmentRow[]

  const trades = new Map<string, string>()
  for (const row of companies) if (row.company?.trade) trades.set(row.subcontractor_company_id, row.company.trade)
  const unknownTrades = [
    ...new Set(people.map((p) => p.via?.company?.subcontractor_company_id).filter((id): id is string => Boolean(id) && !trades.has(id as string))),
  ]
  if (subcontractorsEnabled && unknownTrades.length) {
    // A trade is supporting detail: when this lookup fails the assignments are still listed, without it.
    const { data } = await supabase.from('subcontractor_companies').select('id, trade').eq('organization_id', organizationId).in('id', unknownTrades)
    for (const row of (data ?? []) as { id: string; trade: string | null }[]) if (row.trade) trades.set(row.id, row.trade)
  }

  return {
    state: 'ready',
    items: buildSubcontractorEntries(
      companies.map((row) => ({
        subcontractor_company_id: row.subcontractor_company_id,
        company_name: row.company?.company_name ?? null,
        trade: row.company?.trade ?? null,
      })),
      people.map((row) => ({
        person_id: row.person_id,
        name: row.person ? personName(row.person) : 'Unknown contact',
        project_role: row.project_role,
        company_name: row.via?.company?.company_name ?? null,
        trade: trades.get(row.via?.company?.subcontractor_company_id ?? '') ?? null,
      })),
      // The directory records are open to administrators and project managers only.
      {
        company: manager && subcontractorsEnabled ? (id) => `/subcontractors/${id}` : null,
        person: manager ? (id) => `/contacts/people/${id}` : null,
      },
    ),
  }
}

async function loadNextActivity(
  supabase: Supabase,
  projectId: string,
  schedule: {
    enabled: boolean
    rows: PreviewActivityRow[]
    failed: boolean
    /** Whether this viewer may read which subcontractor companies work an activity. */
    companies: boolean
    personName: (userId: string | null) => string | null
  },
): Promise<PreviewNextActivity> {
  const scheduleHref = `/projects/${projectId}/schedule`
  if (!schedule.enabled) return { state: 'off', scheduleHref }
  if (schedule.failed) return { state: 'error', scheduleHref }

  const picked = pickNextActivity(schedule.rows)
  if (picked.state === 'undated') {
    return { state: 'undated', scheduleHref, openCount: undatedOpenActivityCount(schedule.rows), firstName: picked.first.name }
  }
  if (picked.state !== 'ready') return { state: picked.state, scheduleHref }

  const { activity } = picked
  const companiesRes = schedule.companies
    ? await supabase
        .from('schedule_activity_assignments')
        .select('company:subcontractor_companies(company_name)')
        .eq('schedule_activity_id', activity.id)
        .eq('status', 'active')
    : null
  const companyNames = ((companiesRes?.data ?? []) as unknown as { company: { company_name: string } | null }[]).map(
    (row) => row.company?.company_name,
  )

  return {
    state: 'ready',
    scheduleHref,
    href: `${scheduleHref}?activity=${encodeURIComponent(activity.id)}`,
    name: activity.name,
    milestone: activity.activity_type === 'milestone',
    plannedLabel: plannedLabel(activity),
    status: activity.status,
    overdue: isPastPlannedFinish(activity),
    assignedTo: activityAssignees(schedule.personName(activity.assigned_to), companyNames),
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
  const {
    data: photoRows,
    count,
    error: photoError,
  } = await supabase
    .from('daily_log_photos')
    .select('id, storage_path, caption', { count: 'exact' })
    .eq('daily_log_id', log.id)
    .order('created_at')
    .limit(PREVIEW_PHOTO_LIMIT)
  const rows = (photoRows ?? []) as { id: string; storage_path: string; caption: string | null }[]
  // Photos are never public: each thumbnail is a short-lived signed URL issued for this viewer.
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
    photosFailed: Boolean(photoError) || photos.length < rows.length,
  }
}

/** Row-level security returns only the questions this person may see; drafts and closed questions are left out. */
async function loadPendingQuestions(supabase: Supabase, projectId: string): Promise<PreviewQuestions> {
  const { data, error, count } = await supabase
    .from('project_rfis')
    .select(RFI_LIST_COLUMNS, { count: 'exact' })
    .eq('project_id', projectId)
    .in('status', ['open', 'answered'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: true })
    .limit(PENDING_QUESTION_SCAN)
  if (error) return isRfiSetupError(error) ? { state: 'off' } : { state: 'error' }
  const rows = (data ?? []) as unknown as PendingQuestionRow[]
  return {
    state: 'ready',
    items: pickPendingQuestions(rows, projectId),
    total: count ?? rows.length,
    href: rfisPath(projectId),
  }
}
