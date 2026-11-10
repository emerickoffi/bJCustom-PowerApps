import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { AlertTriangle, Calculator } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getStaffMembers } from '@/lib/queries'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { coverAlt } from '@/lib/project-cover'
import { ProjectStatusCard } from '@/components/projects/project-status-card'
import { ReportIssueAction } from '@/components/issues/report-issue-action'
import type { ProjectClientLink } from '@/components/projects/project-people'
import { ProjectPeopleSummary } from '@/components/projects/project-people-summary'
import { AssignSubcontractors, AssignSubcontractorsLink } from '@/components/projects/assign-subcontractors'
import { ProjectOverviewHeader, HeaderBadge } from '@/components/projects/project-overview-header'
import { ProjectDetailsDrawer } from '@/components/projects/project-details-drawer'
import { ProjectDetailsContent } from '@/components/projects/project-details-content'
import { ProjectFinanceStrip } from '@/components/projects/project-finance-strip'
import { ProjectScheduleSnapshot, type SnapshotActivity } from '@/components/projects/project-schedule-snapshot'
import { PROJECT_TYPE_LABELS, directoryClosedReason, type ProjectStatus } from '@/lib/domain'
import { loadProjectContacts } from '@/lib/project-contacts-data'
import { loadProjectHomeowners } from '@/lib/project-homeowners-data'
import { loadDirectoryForAssignment } from '@/lib/directory-assignment-data'
import { formatAddress, formatCents, formatDate } from '@/lib/format'
import { PROJECT_SECTION_ANCHORS } from '@/lib/project-nav'
import { ProjectSectionScroll } from '@/components/projects/project-section-scroll'
import { ProjectNextActions, type WorkScope } from '@/components/projects/next-actions'
import { buildProjectNextActions } from '@/lib/next-actions'
import { buildProjectSetup, setupDismissCookie } from '@/lib/project-setup'
import { ProjectSetupChecklist, ShowSetupChecklistButton } from '@/components/projects/project-setup-checklist'
import { lifecycleGroup } from '@/lib/project-lifecycle'
import { todayIso } from '@/lib/schedule'
import { showsCompletionReadiness } from '@/lib/completion-readiness'
import { loadCompletionReadiness, loadCompletionRecord } from '@/lib/completion-readiness-data'
import { CompletionReadinessPanel } from '@/components/projects/completion-readiness-panel'
import { CompletedProjectPanel, type CompletedExceptionView } from '@/components/projects/completed-project-panel'

export const metadata: Metadata = { title: 'Project' }

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ work?: string | string[]; details?: string | string[] }>
}) {
  const session = await requireStaff()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const scope: WorkScope = query.work === 'mine' ? 'mine' : 'all'
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  const manager = canManage(session.role)
  const features = await getOrgFeatures(session.organizationId)
  const signing = features.documents && features.e_signatures
  const directoryClosed = directoryClosedReason(project.status, project.archived_at)
  const projectContactsPromise = loadProjectContacts(supabase, session.organizationId, id)
  const [linksRes, membersRes, historyRes, staff, homeowners, activitiesRes, openIssuesRes, photos, reviewEstimatesRes, signaturesRes] = await Promise.all([
    supabase
      .from('project_clients')
      .select('id, relationship, client:clients(id, first_name, last_name, email)')
      .eq('project_id', id)
      .order('created_at'),
    supabase.from('project_members').select('id, user_id, project_role').eq('project_id', id).order('created_at'),
    supabase
      .from('project_status_history')
      .select('id, from_status, to_status, note, changed_by, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    loadProjectHomeowners(supabase, session.organizationId, id),
    supabase
      .from('schedule_activities')
      .select('id, name, status, planned_start, planned_end, sort_order, assigned_to, activity_type')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('project_issues')
      .select('id, item_label', { count: 'exact' })
      .eq('project_id', id)
      .neq('status', 'closed')
      .order('reported_at', { ascending: true })
      .limit(1),
    getProjectCoverPhotos([id]),
    features.estimates && manager
      ? supabase.from('estimates').select('id').eq('project_id', id).eq('status', 'internal_review').order('created_at')
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    signing
      ? supabase
          .from('signature_requests')
          .select('document_id, status, created_at')
          .eq('project_id', id)
          .order('created_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as { document_id: string; status: string; created_at: string }[], error: null }),
  ])
  const noCount = Promise.resolve({ count: null as number | null, error: null })
  const [projectContacts, myIssuesRes, documentsRes, estimatesRes, cookieJar, directory] = await Promise.all([
    projectContactsPromise,
    supabase
      .from('project_issues')
      .select('id, item_label', { count: 'exact' })
      .eq('project_id', id)
      .eq('responsible_user_id', session.userId)
      .neq('status', 'closed')
      .order('reported_at', { ascending: true })
      .limit(1),
    manager && features.documents
      ? supabase.from('project_documents').select('id', { count: 'exact', head: true }).eq('project_id', id).is('archived_at', null)
      : noCount,
    manager && features.estimates
      ? supabase.from('estimates').select('id', { count: 'exact', head: true }).eq('project_id', id)
      : noCount,
    cookies(),
    manager && !directoryClosed
      ? loadDirectoryForAssignment(supabase, session.organizationId, id, !!features.subcontractors)
      : Promise.resolve(null),
  ])
  const isCompleted = project.status === 'completed'
  const [readiness, completionRecord, warrantyRes] = await Promise.all([
    showsCompletionReadiness(project.status) ? loadCompletionReadiness(supabase, id, features, manager) : Promise.resolve(null),
    isCompleted ? loadCompletionRecord(supabase, id) : Promise.resolve(null),
    isCompleted && features.warranty
      ? supabase.from('project_warranties').select('start_date').eq('project_id', id).maybeSingle()
      : Promise.resolve({ data: null as { start_date: string } | null }),
  ])
  const warrantyStart = warrantyRes.data?.start_date ?? null

  const nameFor = (userId: string | null) => {
    if (!userId) return null
    const m = staff.find((s) => s.user_id === userId)
    return m ? m.full_name || m.email || 'Team member' : 'Former team member'
  }
  const links = (linksRes.data ?? []) as unknown as ProjectClientLink[]
  const members = (membersRes.data ?? []).map((m) => ({ ...m, name: nameFor(m.user_id) ?? 'Team member' }))
  const status = project.status as ProjectStatus
  const progress = project.progress_percent === null ? null : Number(project.progress_percent)
  const cover = photos.get(id)

  const activities = (activitiesRes.data ?? []) as unknown as (SnapshotActivity & { sort_order: number; assigned_to: string | null })[]
  const counted = activities.filter((a) => a.status !== 'skipped')
  /** `null` when the lookup failed, so the header never shows an unavailable count as zero. */
  const openIssues = openIssuesRes.error ? null : (openIssuesRes.count ?? 0)
  const today = todayIso()
  const lateActivities = counted
    .filter((a) => a.status !== 'completed' && (a.status === 'delayed' || (!!a.planned_end && a.planned_end < today)))
    .sort((a, b) => (a.planned_end ?? '9999-12-31').localeCompare(b.planned_end ?? '9999-12-31'))
  const nextActionsIncomplete = Boolean(
    activitiesRes.error || openIssuesRes.error || myIssuesRes.error || reviewEstimatesRes.error || signaturesRes.error,
  )
  const lateSummary = (list: typeof lateActivities) => ({
    lateActivityCount: list.length,
    firstLateActivity: list[0]
      ? { name: list[0].name, dueLabel: list[0].planned_end ? `Due ${formatDate(list[0].planned_end)}` : null }
      : null,
  })
  const sharedActionState = {
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
    isProjectManager: project.project_manager_id === session.userId,
    reviewEstimateIds: (reviewEstimatesRes.data ?? []).map((e) => e.id),
    signatureRequests: signaturesRes.data ?? [],
  }
  const actionsByScope = {
    all: buildProjectNextActions({
      ...sharedActionState,
      scope: 'all',
      ...lateSummary(lateActivities),
      openIssueCount: openIssues ?? 0,
      firstOpenIssueId: openIssuesRes.data?.[0]?.id ?? null,
      firstOpenIssueLabel: openIssuesRes.data?.[0]?.item_label ?? null,
    }),
    mine: buildProjectNextActions({
      ...sharedActionState,
      scope: 'mine',
      ...lateSummary(lateActivities.filter((a) => a.assigned_to === session.userId)),
      openIssueCount: myIssuesRes.error ? 0 : (myIssuesRes.count ?? 0),
      firstOpenIssueId: myIssuesRes.data?.[0]?.id ?? null,
      firstOpenIssueLabel: myIssuesRes.data?.[0]?.item_label ?? null,
    }),
  }
  const nextActions = actionsByScope[scope]
  const scopeTotal = (s: WorkScope) => actionsByScope[s].items.length + actionsByScope[s].hiddenCount
  const scopeHref = (s: WorkScope) => (s === 'mine' ? `/projects/${project.id}?work=mine` : `/projects/${project.id}`)
  const contactsActiveCount =
    projectContacts.availability === 'ready' ? projectContacts.contacts.filter((c) => c.status === 'active').length : null

  const showsSetup = manager && !isCompleted && lifecycleGroup(project.status) !== 'closed'
  const setup = buildProjectSetup({
    projectId: project.id,
    features: { schedule: features.schedule, documents: features.documents, estimates: features.estimates },
    hasProjectManager: Boolean(project.project_manager_id),
    hasHomeowner: linksRes.error ? null : (linksRes.data?.length ?? 0) > 0,
    hasTeam:
      (membersRes.data?.length ?? 0) > 0 || (contactsActiveCount ?? 0) > 0
        ? true
        : membersRes.error || contactsActiveCount === null
          ? null
          : false,
    hasSchedule: activitiesRes.error ? null : activities.length > 0,
    hasDocuments: documentsRes.error || documentsRes.count === null ? null : documentsRes.count > 0,
    hasEstimate: estimatesRes.error || estimatesRes.count === null ? null : estimatesRes.count > 0,
    teamAnchor: PROJECT_SECTION_ANCHORS.team,
  })
  const setupDismissed = cookieJar.get(setupDismissCookie(project.id))?.value === '1'
  const history = historyRes.data ?? []
  const primaryClient = links[0]?.client
  const managerName = nameFor(project.project_manager_id)
  const lotBlockPhase =
    [
      project.lot && `Lot ${project.lot}`,
      project.block && `Block ${project.block}`,
      project.phase && `Phase ${project.phase}`,
    ]
      .filter(Boolean)
      .join(' · ') || null

  const completionReview = completionRecord?.availability === 'ready' ? completionRecord.review : null
  const exceptionViews: CompletedExceptionView[] =
    completionRecord?.availability === 'ready'
      ? completionRecord.exceptions.map((e) => ({
          id: e.id,
          label: e.requirement_label,
          detail: e.requirement_detail,
          reason: e.reason,
          justification: e.justification,
          followUpName: nameFor(e.follow_up_user_id) ?? 'Team member',
          targetDate: e.target_resolution_date,
          evidence: e.evidence_reference,
          approvedByName: nameFor(e.approved_by) ?? 'Administrator',
          approvedAt: e.approved_at,
          status: e.status,
          resolvedByName: nameFor(e.resolved_by),
          resolvedAt: e.resolved_at,
          resolutionNote: e.resolution_note,
          canResolve: manager || e.follow_up_user_id === session.userId,
        }))
      : []
  const openExceptionCount = exceptionViews.filter((e) => e.status === 'open').length
  const completionDate = (project.completion_date as string | null) ?? null

  const assignRows =
    manager && !directoryClosed && projectContacts.availability === 'ready' && directory?.availability === 'ready'
      ? directory.rows
      : null
  const assignNote =
    !manager || assignRows ? null : (directoryClosed ?? 'The business directory isn’t set up for this organization yet.')

  const financialsHref = manager && features.estimates ? `/projects/${project.id}/financials` : null
  const headerBadges = (
    <>
      {isCompleted && features.warranty && (
        <HeaderBadge>{warrantyStart ? `Warranty since ${formatDate(warrantyStart)}` : 'Warranty not set up'}</HeaderBadge>
      )}
      {openExceptionCount > 0 && (
        <HeaderBadge tone="warning">
          <AlertTriangle className="size-3" aria-hidden="true" />
          {`${openExceptionCount} open completion ${openExceptionCount === 1 ? 'exception' : 'exceptions'}`}
        </HeaderBadge>
      )}
      {openIssues === null ? (
        <HeaderBadge>Issues unavailable</HeaderBadge>
      ) : (
        openIssues > 0 && <HeaderBadge tone="warning">{`${openIssues} open ${openIssues === 1 ? 'issue' : 'issues'}`}</HeaderBadge>
      )}
    </>
  )

  const details = (
    <ProjectDetailsContent
      statusCard={
        manager ? (
          <ProjectStatusCard
            projectId={project.id}
            projectName={project.name}
            status={status}
            lastUpdatedLabel={history[0] ? formatDate(history[0].created_at) : formatDate(project.updated_at ?? project.created_at)}
            dateLabel={project.completion_date ? 'Completed' : 'Target completion'}
            dateValue={formatDate(project.completion_date ?? project.target_completion_date)}
          />
        ) : null
      }
      editHref={manager ? `/projects/${project.id}/edit` : null}
      facts={[
        { label: 'Project type', value: PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type ?? null },
        { label: 'Homeowner', value: primaryClient ? `${primaryClient.first_name} ${primaryClient.last_name}` : null },
        { label: 'Community', value: project.community || null },
        { label: 'Lot / Block / Phase', value: lotBlockPhase },
        { label: 'Estimated budget', value: project.estimated_budget_cents === null ? null : formatCents(project.estimated_budget_cents) },
        { label: 'Proposed start', value: project.proposed_start_date ? formatDate(project.proposed_start_date) : null },
        isCompleted
          ? { label: 'Completed', value: completionDate ? formatDate(completionDate) : null }
          : { label: 'Target completion', value: project.target_completion_date ? formatDate(project.target_completion_date) : null },
      ]}
      description={project.description || null}
      legalDescription={project.legal_description || null}
      internalNotes={project.internal_notes || null}
      setupAction={
        showsSetup && !setup.complete && setupDismissed ? (
          <ShowSetupChecklistButton projectId={project.id} remaining={setup.steps.length - setup.doneCount} />
        ) : showsSetup && setup.complete ? (
          <p className="text-sm text-muted-foreground">{`Project setup: ${setup.doneCount} of ${setup.steps.length} complete.`}</p>
        ) : null
      }
      history={history.map((h) => ({ ...h, byName: nameFor(h.changed_by) ?? 'System' }))}
      historyError={Boolean(historyRes.error)}
    />
  )

  const people = (
    <ProjectPeopleSummary
      id={PROJECT_SECTION_ANCHORS.team}
      projectId={project.id}
      homeowners={homeowners}
      managerName={managerName}
      members={members}
      contacts={projectContacts.availability === 'ready' ? projectContacts.contacts : null}
      companies={projectContacts.availability === 'ready' ? projectContacts.companies : []}
      assignAction={assignRows ? <AssignSubcontractorsLink /> : null}
      assignNote={assignNote}
    />
  )

  const overview = (
    <div className="flex flex-col gap-6">
      <ProjectSectionScroll />
      <ProjectOverviewHeader
        projectNumber={project.project_number}
        name={project.name}
        status={status}
        address={formatAddress(project)}
        managerName={managerName}
        dateLabel={isCompleted ? 'Completed' : 'Target'}
        dateValue={
          isCompleted
            ? completionDate
              ? formatDate(completionDate)
              : 'Not recorded'
            : project.target_completion_date
              ? formatDate(project.target_completion_date)
              : 'Not set'
        }
        cover={cover ? { src: cover.url, alt: coverAlt(cover.kind, project.name) } : null}
        badges={headerBadges}
        actions={
          <>
            {manager && features.estimates && !isCompleted && (
              <Button variant="outline" render={<Link href={`/estimates/new?project=${project.id}`} />} nativeButton={false}>
                <Calculator data-icon="inline-start" />
                Create estimate
              </Button>
            )}
            <ReportIssueAction
              projectId={project.id}
              projectLabel={`${project.project_number} · ${project.name}`}
              triggerVariant="outline"
            />
            <ProjectDetailsDrawer projectName={project.name} defaultOpen={query.details === 'open'}>
              {details}
            </ProjectDetailsDrawer>
          </>
        }
      />

      {showsSetup && !setup.complete && !setupDismissed && (
        <ProjectSetupChecklist projectId={project.id} steps={setup.steps} doneCount={setup.doneCount} />
      )}

      <ProjectNextActions
        items={nextActions.items}
        hiddenCount={nextActions.hiddenCount}
        incomplete={nextActionsIncomplete}
        scope={scope}
        scopeTotals={{ mine: scopeTotal('mine'), all: scopeTotal('all') }}
        scopeHrefs={{ mine: scopeHref('mine'), all: scopeHref('all') }}
      />

      {readiness && <CompletionReadinessPanel summary={readiness} projectId={project.id} canReview={manager} />}
      {isCompleted && (
        <CompletedProjectPanel
          projectId={project.id}
          completionDate={completionDate}
          warrantyStart={warrantyStart}
          review={
            completionRecord?.availability !== 'ready'
              ? 'unavailable'
              : completionReview
                ? {
                    outcome: completionReview.outcome,
                    approvedByName: nameFor(completionReview.approved_by) ?? 'Team member',
                    approvedAt: completionReview.approved_at,
                    note: completionReview.note,
                  }
                : 'legacy'
          }
          exceptions={exceptionViews}
        />
      )}

      {manager && (
        <ProjectFinanceStrip
          projectId={project.id}
          budgetCents={project.estimated_budget_cents ?? null}
          showEstimates={Boolean(features.estimates)}
          showInvoices={Boolean(features.invoices)}
          financialsHref={financialsHref}
        />
      )}

      <div className={features.schedule ? 'grid items-start gap-6 lg:grid-cols-2' : 'grid gap-6'}>
        {features.schedule && (
          <ProjectScheduleSnapshot
            projectId={project.id}
            activities={activities}
            loadError={Boolean(activitiesRes.error)}
            progress={progress}
          />
        )}
        {people}
      </div>
    </div>
  )

  return assignRows ? (
    <AssignSubcontractors projectId={project.id} projectName={project.name as string} rows={assignRows} canCreateCompany={!!features.subcontractors}>
      {overview}
    </AssignSubcontractors>
  ) : (
    overview
  )
}
