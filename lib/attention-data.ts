import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { todayIso } from '@/lib/schedule'
import {
  informationalNotifications,
  type AttentionActivity,
  type AttentionDailyLogDelay,
  type AttentionNotification,
} from '@/lib/attention'
import {
  COMMITTED_STAGES,
  START_WINDOW_DAYS,
  buildActionItems,
  daysBetween,
  type ActionEntityType,
  type ActionEstimateApproval,
  type ActionFeatures,
  type ActionInvoice,
  type ActionIssue,
  type ActionItem,
  type ActionProject,
  type ActionSignedArtifact,
  type ActionWarrantyClaim,
} from '@/lib/action-items'
import { signedDocumentIds } from '@/lib/esign/signed-artifacts'
import { buildQualificationAttention, type QualificationAttention } from '@/lib/subcontractor-qualification'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import { projectAcceptsNewAssignments } from '@/lib/domain'

type ProjectRef = { name: string; archived_at?: string | null } | { name: string; archived_at?: string | null }[] | null
const projectOf = (p: ProjectRef) => (Array.isArray(p) ? p[0] : p) ?? null
const projectName = (p: ProjectRef) => projectOf(p)?.name ?? null
const isArchived = (p: ProjectRef) => !!projectOf(p)?.archived_at

const NOTIFICATION_LIMIT = 60
const ACTIVITY_LIMIT = 50
const LOG_DELAY_LIMIT = 10
const LOG_DELAY_WINDOW_DAYS = 7
const SOURCE_LIMIT = 100

/** A module whose records could not be checked. Its absence from the list is not proof it is healthy. */
export type ActionModuleIssue = { module: string; state: 'unavailable' | 'setup_required'; detail: string }

export type ActionCenterData = {
  items: ActionItem[]
  total: number
  totalIsLowerBound: boolean
  unavailable: ActionModuleIssue[]
  /** Unread informational notifications: shown in Recent Activity, never counted as actions. */
  updates: AttentionNotification[]
  /** Informational notifications loaded before the 5-item slice; a lower bound when the query hit its limit. */
  updatesTotal: number
  updatesTotalIsLowerBound: boolean
}

function shiftDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The single source for the Action Center and the dashboard count. Every query runs as the signed-in user,
 * so RLS limits it to projects they can see; builder-only sources are skipped entirely for other roles.
 */
export async function getActionItems(
  orgId: string,
  userId: string,
  options: { manager: boolean; features: ActionFeatures },
): Promise<ActionCenterData> {
  const { manager, features } = options
  const supabase = await createClient()
  const today = todayIso()
  const unavailable: ActionModuleIssue[] = []
  let truncated = false
  const fail = (module: string, detail = 'Could not be checked right now.') =>
    unavailable.push({ module, state: 'unavailable', detail })

  if (features.subcontractors && manager) {
    // Deduplicated server-side; failures are reported below through the qualification read instead.
    await supabase.rpc('refresh_subcontractor_qualification_notices', { p_organization_id: orgId }).then(
      () => undefined,
      () => undefined,
    )
  }

  const empty = Promise.resolve({ data: [] as never[], error: null, count: 0 })
  const signatureSource = manager && features.e_signatures && features.documents
  const issueQuery = () => {
    let q = supabase
      .from('project_issues')
      .select(
        'id, project_id, item_label, homeowner_description, status, priority, due_date, builder_approved_at, responsible_user_id, reported_at, projects(name, archived_at)',
      )
      .eq('organization_id', orgId)
    q = manager
      ? q.in('status', ['open', 'in_progress', 'resolved']).or(`due_date.lt.${today},priority.in.(high,critical),status.eq.resolved`)
      : q.in('status', ['open', 'in_progress']).eq('responsible_user_id', userId).or(`due_date.lt.${today},priority.in.(high,critical)`)
    return q.order('due_date', { ascending: true, nullsFirst: false }).limit(SOURCE_LIMIT)
  }
  const claimQuery = () => {
    let q = supabase
      .from('warranty_claims')
      .select('id, project_id, title, status, assigned_to, reported_at, projects(name, archived_at)')
      .eq('organization_id', orgId)
    q = manager
      ? q.in('status', ['submitted', 'under_review', 'accepted', 'in_progress'])
      : q.in('status', ['accepted', 'in_progress']).eq('assigned_to', userId)
    return q.order('reported_at', { ascending: true }).limit(SOURCE_LIMIT)
  }

  const [notificationsRes, activitiesRes, logDelaysRes, signaturesRes, projectsRes, invoicesRes, issuesRes, claimsRes] =
    await Promise.all([
      supabase
        .from('notifications')
        .select('id, title, body, link, kind, action_required, dedupe_key, created_at, project_id, projects(name)')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIMIT),
      features.schedule
        ? supabase
            .from('schedule_activities')
            .select('id, project_id, name, status, planned_end, projects(name)')
            .eq('organization_id', orgId)
            .not('status', 'in', '(completed,skipped)')
            .or(`status.eq.delayed,planned_end.lt.${today}`)
            .order('planned_end', { ascending: true, nullsFirst: false })
            .limit(ACTIVITY_LIMIT)
        : empty,
      features.daily_logs
        ? supabase
            .from('daily_logs')
            .select('id, project_id, log_date, delay_reason, delay_description, projects(name)')
            .eq('organization_id', orgId)
            .not('delay_description', 'is', null)
            .gte('log_date', shiftDays(today, -LOG_DELAY_WINDOW_DAYS))
            .order('log_date', { ascending: false })
            .limit(LOG_DELAY_LIMIT)
        : empty,
      signatureSource
        ? supabase
            .from('signature_requests')
            .select(
              'id, project_id, title, status, document_id, source_version_id, test_mode, completed_at, signed_storage_path, artifact_error, projects(name, archived_at)',
            )
            .eq('organization_id', orgId)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false })
            .limit(SOURCE_LIMIT)
        : empty,
      manager
        ? supabase
            .from('projects')
            .select('id, name, status, proposed_start_date, primary_client_id, address_line1')
            .eq('organization_id', orgId)
            .is('archived_at', null)
            .in('status', [...COMMITTED_STAGES])
            .limit(SOURCE_LIMIT * 2)
        : empty,
      manager && features.invoices
        ? supabase
            .from('invoices')
            .select('id, invoice_number, title, project_id, status, due_date, total_cents, paid_cents, projects(name, archived_at)')
            .eq('organization_id', orgId)
            .in('status', ['issued', 'partially_paid'])
            .lt('due_date', today)
            .order('due_date', { ascending: true })
            .limit(SOURCE_LIMIT)
        : empty,
      features.issues ? issueQuery() : empty,
      features.warranty ? claimQuery() : empty,
    ])

  const check = <T,>(res: { data: T[] | null; error: unknown }, module: string, limit: number): T[] => {
    if (res.error) {
      fail(module)
      return []
    }
    const rows = res.data ?? []
    if (rows.length >= limit) truncated = true
    return rows
  }

  const notificationRows = check(notificationsRes, 'Notifications', NOTIFICATION_LIMIT)
  const activityRows = check(activitiesRes, 'Schedule', ACTIVITY_LIMIT)
  const logRows = check(logDelaysRes, 'Daily Logs', LOG_DELAY_LIMIT)
  const signatureRows = check(signaturesRes, 'E-signatures', SOURCE_LIMIT).filter((r) => !isArchived(r.projects as ProjectRef))
  const projectRows = check(projectsRes, 'Projects', SOURCE_LIMIT * 2)
  const invoiceRows = check(invoicesRes, 'Invoices', SOURCE_LIMIT).filter((r) => !isArchived(r.projects as ProjectRef))
  const issueRows = check(issuesRes, 'Punch List', SOURCE_LIMIT).filter((r) => !isArchived(r.projects as ProjectRef))
  const claimRows = check(claimsRes, 'Warranty', SOURCE_LIMIT).filter((r) => !isArchived(r.projects as ProjectRef))

  const startCandidates = features.schedule
    ? projectRows.filter(
        (p) =>
          (p.status === 'preconstruction' || p.status === 'under_construction') &&
          p.proposed_start_date &&
          daysBetween(today, p.proposed_start_date) <= START_WINDOW_DAYS,
      )
    : []
  const activityIds = activityRows.map((a) => a.id)
  const documentIds = [...new Set(signatureRows.flatMap((r) => (r.document_id ? [r.document_id] : [])))]
  const signedDocByRequest = new Map(signatureRows.map((r) => [r.id, signedDocumentIds(r.id).documentId] as const))

  const [assignmentsRes, scheduledRes, snapshotsRes, filedRes, qualification] = await Promise.all([
    features.subcontractors && activityIds.length
      ? supabase
          .from('schedule_activity_assignments')
          .select('schedule_activity_id, subcontractor_companies(company_name)')
          .eq('organization_id', orgId)
          .eq('status', 'active')
          .in('schedule_activity_id', activityIds)
      : empty,
    startCandidates.length
      ? supabase
          .from('schedule_activities')
          .select('project_id')
          .eq('organization_id', orgId)
          .in('project_id', startCandidates.map((p) => p.id))
          .limit(1000)
      : empty,
    features.estimates && documentIds.length
      ? supabase
          .from('estimate_signing_snapshots')
          .select('estimate_id, document_id, version_id')
          .eq('organization_id', orgId)
          .in('document_id', documentIds)
      : empty,
    signedDocByRequest.size
      ? supabase
          .from('project_documents')
          .select('id')
          .in('id', [...signedDocByRequest.values()])
          .not('current_version_id', 'is', null)
      : empty,
    manager && features.subcontractors ? loadQualification(supabase, orgId, today) : Promise.resolve(null),
  ])

  const companiesByActivity = new Map<string, string[]>()
  for (const row of assignmentsRes.data ?? []) {
    const co = row.subcontractor_companies as { company_name: string } | { company_name: string }[] | null
    const name = (Array.isArray(co) ? co[0]?.company_name : co?.company_name) ?? null
    if (name) companiesByActivity.set(row.schedule_activity_id, [...(companiesByActivity.get(row.schedule_activity_id) ?? []), name])
  }

  let scheduleCounts: Map<string, number> | null = null
  if (scheduledRes.error) fail('Schedule setup', 'Could not check which upcoming projects have a schedule.')
  else {
    scheduleCounts = new Map()
    for (const r of scheduledRes.data ?? []) scheduleCounts.set(r.project_id, (scheduleCounts.get(r.project_id) ?? 0) + 1)
  }

  let estimateApprovals: ActionEstimateApproval[] = []
  if (snapshotsRes.error) fail('Estimates', 'Could not match signed requests to estimates.')
  else if ((snapshotsRes.data ?? []).length) {
    const snapshots = snapshotsRes.data ?? []
    const { data: estimates, error } = await supabase
      .from('estimates')
      .select('id, estimate_number, name, status, project_id')
      .eq('organization_id', orgId)
      .in('id', snapshots.map((s) => s.estimate_id))
    if (error) fail('Estimates')
    const byId = new Map((estimates ?? []).map((e) => [e.id, e]))
    estimateApprovals = snapshots.flatMap((s) => {
      const estimate = byId.get(s.estimate_id)
      const req = signatureRows.find((r) => r.document_id === s.document_id)
      if (!estimate || !req) return []
      return [
        {
          estimateId: estimate.id,
          estimateNumber: estimate.estimate_number,
          estimateName: estimate.name,
          estimateStatus: estimate.status,
          projectId: estimate.project_id,
          projectName: projectName(req.projects as ProjectRef),
          requestId: req.id,
          requestStatus: req.status,
          requestDocumentId: req.document_id,
          requestSourceVersionId: req.source_version_id,
          snapshotDocumentId: s.document_id,
          snapshotVersionId: s.version_id,
          testMode: req.test_mode,
          completedAt: req.completed_at,
        },
      ]
    })
  }

  let signedArtifacts: ActionSignedArtifact[] = []
  if (filedRes.error) fail('Documents', 'Could not confirm signed PDFs are filed.')
  else {
    const filed = new Set((filedRes.data ?? []).map((d) => d.id))
    signedArtifacts = signatureRows.map((r) => ({
      requestId: r.id,
      projectId: r.project_id,
      projectName: projectName(r.projects as ProjectRef),
      title: r.title,
      status: r.status,
      completedAt: r.completed_at,
      hasSignedPdf: !!r.signed_storage_path,
      filed: filed.has(signedDocByRequest.get(r.id) ?? ''),
      artifactError: r.artifact_error,
    }))
  }

  if (qualification?.state === 'setup_required') {
    unavailable.push({
      module: 'Subcontractor Compliance',
      state: 'setup_required',
      detail: 'The qualification migration has not been applied, so vetting status could not be checked.',
    })
  } else if (qualification?.state === 'unavailable') fail('Subcontractor Compliance')

  const notifications: AttentionNotification[] = notificationRows.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    link: n.link,
    kind: n.kind,
    action_required: n.action_required,
    dedupe_key: n.dedupe_key,
    created_at: n.created_at,
    project_id: n.project_id,
    projectName: projectName(n.projects as ProjectRef),
  }))
  const activities: AttentionActivity[] = activityRows.map((a) => ({
    id: a.id,
    project_id: a.project_id,
    name: a.name,
    status: a.status,
    planned_end: a.planned_end,
    projectName: projectName(a.projects as ProjectRef),
    companies: companiesByActivity.get(a.id),
  }))
  const logDelays: AttentionDailyLogDelay[] = logRows.map((l) => ({
    id: l.id,
    project_id: l.project_id,
    projectName: projectName(l.projects as ProjectRef),
    log_date: l.log_date,
    delay_reason: l.delay_reason,
    delay_description: l.delay_description as string,
  }))
  const projects: ActionProject[] = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    proposedStartDate: p.proposed_start_date,
    primaryClientId: p.primary_client_id,
    addressLine1: p.address_line1,
    scheduleActivityCount: scheduleCounts ? (scheduleCounts.get(p.id) ?? 0) : null,
  }))
  const invoices: ActionInvoice[] = invoiceRows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoice_number,
    title: r.title,
    projectId: r.project_id,
    projectName: projectName(r.projects as ProjectRef),
    status: r.status,
    dueDate: r.due_date,
    totalCents: Number(r.total_cents),
    paidCents: Number(r.paid_cents),
  }))
  const issues: ActionIssue[] = issueRows.map((i) => ({
    id: i.id,
    projectId: i.project_id,
    projectName: projectName(i.projects as ProjectRef),
    label: i.item_label,
    description: i.homeowner_description ?? '',
    status: i.status,
    priority: i.priority,
    dueDate: i.due_date,
    builderApprovedAt: i.builder_approved_at,
    responsibleUserId: i.responsible_user_id,
    reportedAt: i.reported_at,
  }))
  const warrantyClaims: ActionWarrantyClaim[] = claimRows.map((c) => ({
    id: c.id,
    projectId: c.project_id,
    projectName: projectName(c.projects as ProjectRef),
    title: c.title,
    status: c.status,
    assignedTo: c.assigned_to,
    reportedAt: c.reported_at,
  }))

  const authoritative = new Set<ActionEntityType>()
  if (manager && features.warranty && !claimsRes.error && claimRows.length < SOURCE_LIMIT) authoritative.add('warranty_claim')
  if (qualification?.state === 'ready') authoritative.add('subcontractor')

  const items = buildActionItems(
    {
      notifications,
      activities,
      logDelays,
      estimateApprovals,
      signedArtifacts,
      projects,
      invoices,
      qualification: qualification?.state === 'ready' ? qualification.items : [],
      issues,
      warrantyClaims,
      authoritative,
    },
    { today, userId, manager, features },
  )

  const informational = informationalNotifications(notifications, features)
  return {
    items,
    total: items.length,
    totalIsLowerBound: truncated,
    unavailable,
    updates: informational.slice(0, 5),
    updatesTotal: informational.length,
    updatesTotalIsLowerBound: notificationRows.length >= NOTIFICATION_LIMIT,
  }
}

type QualificationResult =
  | { state: 'ready'; items: QualificationAttention[] }
  | { state: 'setup_required' | 'unavailable' }

async function loadQualification(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  today: string,
): Promise<QualificationResult> {
  const [summaries, companiesRes, assignmentsRes] = await Promise.all([
    loadQualificationSummaries(supabase, orgId),
    supabase.from('subcontractor_companies').select('id, company_name, status').eq('organization_id', orgId).limit(1000),
    supabase
      .from('subcontractor_project_assignments')
      .select('subcontractor_company_id, projects(status, archived_at)')
      .eq('organization_id', orgId)
      .is('ended_at', null)
      .limit(5000),
  ])
  if (summaries.availability === 'setup-required') return { state: 'setup_required' }
  if (summaries.availability === 'error' || companiesRes.error || assignmentsRes.error) return { state: 'unavailable' }

  const currentProjects = new Map<string, number>()
  for (const a of assignmentsRes.data ?? []) {
    const p = (Array.isArray(a.projects) ? a.projects[0] : a.projects) as { status: string; archived_at: string | null } | null
    if (!p || p.archived_at || !projectAcceptsNewAssignments(p.status)) continue
    currentProjects.set(a.subcontractor_company_id, (currentProjects.get(a.subcontractor_company_id) ?? 0) + 1)
  }
  const rows = (companiesRes.data ?? []).flatMap((c) => {
    const summary = summaries.byCompany[c.id]
    return summary
      ? [{ summary, companyName: c.company_name, companyActive: c.status === 'active', currentProjects: currentProjects.get(c.id) ?? 0 }]
      : []
  })
  return { state: 'ready', items: buildQualificationAttention(rows, today) }
}
