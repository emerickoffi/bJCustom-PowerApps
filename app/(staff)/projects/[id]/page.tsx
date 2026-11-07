import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarRange,
  CircleCheck,
  ClipboardCheck,
  FolderOpen,
  Hammer,
  History,
  LandPlot,
  MapPin,
  Pencil,
  Trees,
  Users,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getClientOptions, getStaffMembers } from '@/lib/queries'
import { getProjectCoverPhotos } from '@/lib/project-photos'
import { coverAlt, coverDesignBadge } from '@/lib/project-cover'
import { CoverImage } from '@/components/projects/cover-image'
import type { ReactNode } from 'react'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { ProgressRing } from '@/components/shared/progress'
import { ProjectStatusCard } from '@/components/projects/project-status-card'
import { ReportIssueAction } from '@/components/issues/report-issue-action'
import { AssistantProjectScope } from '@/components/assistant/assistant-context'
import { ProjectWalkthroughsPanel } from '@/components/walkthroughs/project-walkthroughs-panel'
import { ProjectEstimatesPanel } from '@/components/estimates/project-estimates-panel'
import { ProjectSchedulePanel } from '@/components/schedule/project-schedule-panel'
import { ProjectInvoicesPanel } from '@/components/invoices/project-invoices-panel'
import { ProjectClientsPanel, type ProjectClientLink } from '@/components/projects/project-people'
import { ProjectTeamPanel } from '@/components/projects/project-team-panel'
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/domain'
import { loadProjectContacts } from '@/lib/project-contacts-data'
import { loadProjectHomeowners } from '@/lib/project-homeowners-data'
import { formatAddress, formatCents, formatDate, formatDateTime } from '@/lib/format'
import { PROJECT_SECTION_ANCHORS } from '@/lib/project-nav'
import { ProjectSectionScroll } from '@/components/projects/project-section-scroll'
import { cookies } from 'next/headers'
import { ProjectNextActions, type WorkScope } from '@/components/projects/next-actions'
import { buildProjectNextActions } from '@/lib/next-actions'
import { buildProjectSetup, setupDismissCookie } from '@/lib/project-setup'
import { ProjectSetupChecklist, ShowSetupChecklistButton } from '@/components/projects/project-setup-checklist'
import { PROGRESS_WEIGHTING_NOTE } from '@/components/schedule/project-schedule-panel'
import { lifecycleGroup } from '@/lib/project-lifecycle'
import { todayIso } from '@/lib/schedule'
import { showsCompletionReadiness } from '@/lib/completion-readiness'
import { loadCompletionReadiness, loadCompletionRecord } from '@/lib/completion-readiness-data'
import { CompletionReadinessPanel } from '@/components/projects/completion-readiness-panel'
import { CompletedProjectPanel, type CompletedExceptionView } from '@/components/projects/completed-project-panel'

export const metadata: Metadata = { title: 'Project' }

function Fact({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-link-border">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-white/60">{label}</span>
        <span className="break-words text-sm font-medium text-white">{value}</span>
      </div>
    </div>
  )
}

/** Flattens the existing people panels so they read as parts of one Project team card. */
const TEAM_PART =
  'px-4 py-3 [&>section]:gap-3 [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none [&>section>div>h2]:font-sans [&>section>div>h2]:text-sm [&>section>div>h2]:font-semibold'

function DetailField({
  icon: Icon,
  label,
  value,
  empty = 'Not provided',
  action,
}: {
  icon: typeof Wallet
  label: string
  value: string | null
  empty?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#F3F4F6] text-primary ring-1 ring-inset ring-[#D6DDE5]">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5 pt-px">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={value ? 'break-words text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}>{value ?? empty}</dd>
        {action}
      </div>
    </div>
  )
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ work?: string | string[] }>
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
      .select('name, status, planned_start, planned_end, sort_order, assigned_to')
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
  const [projectContacts, clientOptions, myIssuesRes, documentsRes, estimatesRes, cookieJar] = await Promise.all([
    projectContactsPromise,
    manager ? getClientOptions(session.organizationId) : Promise.resolve(undefined),
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
  const heroPlaceholder = (
    <div className="blueprint absolute inset-0 flex items-end p-6" aria-hidden="true">
      <span className="text-xs text-white/50">Site photos from walkthroughs will appear here</span>
    </div>
  )

  const activities = activitiesRes.data ?? []
  const counted = activities.filter((a) => a.status !== 'skipped')
  const completed = counted.filter((a) => a.status === 'completed').length
  const delayed = counted.filter((a) => a.status === 'delayed').length
  const nextUp = counted.find((a) => a.status !== 'completed')
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
  const longDescription = (project.description?.length ?? 0) > 220
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

  return (
    <div className="flex flex-col gap-6">
      <ProjectSectionScroll />
      <section aria-labelledby="project-heading" className="overflow-hidden rounded-3xl bg-brand-deep text-white shadow-lift">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-4 p-4 sm:p-5 xl:px-7 xl:py-5">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-white/60">{project.project_number}</span>
                <ProjectStatusBadge status={status} />
              </div>
              <h1 id="project-heading" className="text-balance font-serif text-2xl font-semibold leading-tight md:text-3xl">
                {project.name}
              </h1>
              <p className="flex items-start gap-2 text-sm text-white/70">
                <MapPin className="mt-0.5 size-4 shrink-0 text-link-border" aria-hidden="true" />
                {formatAddress(project)}
              </p>
            </div>
            {isCompleted ? (
              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <CircleCheck className="size-4 text-link-border" aria-hidden="true" />
                  {completionDate ? `Completed ${formatDate(completionDate)}` : 'Completed · date not recorded'}
                </span>
                <div className="flex flex-wrap gap-2">
                  {features.warranty && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/85">
                      {warrantyStart ? `Warranty phase since ${formatDate(warrantyStart)}` : 'Warranty not set up'}
                    </span>
                  )}
                  {openExceptionCount > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-champagne/20 px-2.5 py-0.5 text-xs font-medium text-champagne">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {`${openExceptionCount} open completion ${openExceptionCount === 1 ? 'exception' : 'exceptions'}`}
                    </span>
                  )}
                  {openIssues !== null && openIssues > 0 && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/85">
                      {`${openIssues} open ${openIssues === 1 ? 'issue' : 'issues'}`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
            <div className="flex flex-wrap items-center gap-4">
              {progress === null ? (
                <span className="flex size-16 shrink-0 items-center justify-center rounded-full border-[5px] border-white/15 px-1 text-center text-[0.6rem] font-medium leading-tight text-white/70">
                  Not configured
                </span>
              ) : (
                <ProgressRing value={progress} label="Weighted construction progress" tone="light" size={64} stroke={5} />
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-medium">
                  {progress === null
                    ? 'Construction progress not configured'
                    : counted.length === 0
                      ? 'No schedule activities yet'
                      : `${completed} of ${counted.length} activities complete`}
                </span>
                {progress === null ? (
                  <span className="max-w-sm text-xs text-white/65">
                    Progress is calculated from weighted schedule milestones. Initialize the construction schedule to begin tracking.
                  </span>
                ) : (
                  counted.length > 0 && <span className="max-w-md text-xs text-white/65">{PROGRESS_WEIGHTING_NOTE}</span>
                )}
                {nextUp && <span className="text-sm text-white/65">{`Next: ${nextUp.name}`}</span>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {delayed > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-champagne/20 px-2.5 py-0.5 text-xs font-medium text-champagne">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {`${delayed} delayed`}
                    </span>
                  )}
                  {openIssues === null ? (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/85">Issues unavailable</span>
                  ) : (
                    openIssues > 0 && (
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/85">
                        {`${openIssues} open ${openIssues === 1 ? 'issue' : 'issues'}`}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
            )}
            <div className="grid gap-x-4 gap-y-2.5 border-t border-white/10 pt-3 sm:grid-cols-2 xl:grid-cols-4">
              <Fact icon={Wallet} label="Estimated budget" value={formatCents(project.estimated_budget_cents)} />
              <Fact icon={CalendarRange} label="Proposed start" value={formatDate(project.proposed_start_date)} />
              {isCompleted ? (
                <Fact icon={CalendarClock} label="Completed" value={completionDate ? formatDate(completionDate) : 'Not recorded'} />
              ) : (
                <Fact icon={CalendarClock} label="Target completion" value={formatDate(project.target_completion_date)} />
              )}
              <Fact
                icon={ClipboardCheck}
                label="Homeowner"
                value={primaryClient ? `${primaryClient.first_name} ${primaryClient.last_name}` : 'Not linked'}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {features.schedule && (
                <Button
                  size="lg"
                  render={<Link href={`/projects/${project.id}/schedule`} />}
                  nativeButton={false}
                  className="bg-link text-white hover:bg-link-hover focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep"
                >
                  <CalendarRange data-icon="inline-start" />
                  Open schedule
                </Button>
              )}
              {features.documents && (
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href={`/projects/${project.id}/documents`} />}
                  nativeButton={false}
                  className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  <FolderOpen data-icon="inline-start" />
                  Documents
                </Button>
              )}
              {features.warranty && project.status === 'completed' && (
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href={`/projects/${project.id}/warranty`} />}
                  nativeButton={false}
                  className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  Warranty
                </Button>
              )}
              {manager && (
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href={`/projects/${project.id}/edit`} />}
                  nativeButton={false}
                  className="border-white/25 bg-white/5 text-white hover:bg-white/15 hover:text-white"
                >
                  <Pencil data-icon="inline-start" />
                  Edit project
                </Button>
              )}
            </div>
          </div>
          <div className="relative aspect-[16/9] md:aspect-auto md:min-h-full">
            {cover ? (
              <CoverImage
                src={cover.url}
                alt={coverAlt(cover.kind, project.name)}
                className="absolute inset-0 size-full object-cover object-center"
                priority
                fallback={heroPlaceholder}
                overlay={
                  coverDesignBadge(cover.kind) && (
                    <span className="absolute bottom-3 right-3 rounded-full bg-brand-deep/75 px-2.5 py-1 text-[0.7rem] font-medium text-white backdrop-blur-sm">
                      {coverDesignBadge(cover.kind)}
                    </span>
                  )
                }
              />
            ) : (
              heroPlaceholder
            )}
          </div>
        </div>
      </section>

      {showsSetup && !setup.complete && !setupDismissed && (
        <ProjectSetupChecklist projectId={project.id} steps={setup.steps} doneCount={setup.doneCount} />
      )}

      <div className="flex justify-end">
        <ReportIssueAction
          projectId={project.id}
          projectLabel={`${project.project_number} · ${project.name}`}
          triggerVariant="outline"
        />
      </div>

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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {features.schedule && <ProjectSchedulePanel projectId={project.id} canManage={manager} />}

          {features.estimates && (
            <ProjectEstimatesPanel
              projectId={project.id}
              budgetCents={project.estimated_budget_cents ?? null}
              canManage={manager}
            />
          )}

          {features.invoices && canManage(session.role) && (
            <ProjectInvoicesPanel projectId={project.id} canManage={manager} />
          )}

          {features.walkthroughs && <ProjectWalkthroughsPanel projectId={project.id} canCreate={manager} />}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          {manager && (
            <ProjectStatusCard
              projectId={project.id}
              projectName={project.name}
              status={status}
              lastUpdatedLabel={history[0] ? formatDate(history[0].created_at) : formatDate(project.updated_at ?? project.created_at)}
              dateLabel={project.completion_date ? 'Completed' : 'Target completion'}
              dateValue={formatDate(project.completion_date ?? project.target_completion_date)}
            />
          )}

          <section
            id={PROJECT_SECTION_ANCHORS.team}
            aria-labelledby="project-team-heading"
            className="surface flex scroll-mt-36 flex-col divide-y p-0"
          >
            <header className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-primary">
                <Users className="size-4" aria-hidden="true" />
              </span>
              <h2 id="project-team-heading" className="font-serif text-lg font-semibold text-foreground">
                Project team
              </h2>
            </header>
            <div className={TEAM_PART}>
              <ProjectClientsPanel projectId={project.id} homeowners={homeowners} canEdit={manager} clientOptions={clientOptions} />
            </div>
            <div className={TEAM_PART}>
              <ProjectTeamPanel
                projectId={project.id}
                projectName={project.name}
                managerId={project.project_manager_id ?? null}
                managerName={managerName}
                members={members}
                staffOptions={staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))}
                canEdit={manager}
              />
              {!managerName && manager && (
                <Link
                  href={`/projects/${project.id}/edit`}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Assign manager
                </Link>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {contactsActiveCount === null
                  ? 'Directory contacts could not be loaded'
                  : `${contactsActiveCount} active directory ${contactsActiveCount === 1 ? 'contact' : 'contacts'}`}
              </span>
              <Link
                href={`/projects/${project.id}/contacts`}
                className="inline-flex min-h-11 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
              >
                Open Contacts
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section aria-labelledby="overview-heading" className="surface flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id="overview-heading" className="scroll-mt-36 font-serif text-lg font-semibold text-foreground">
                Project details
              </h2>
              {manager && (
                <Link
                  href={`/projects/${project.id}/edit`}
                  className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </Link>
              )}
            </div>
            <dl className="grid gap-4">
              <DetailField
                icon={Hammer}
                label="Project type"
                value={PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type ?? null}
              />
              <DetailField icon={Trees} label="Community" value={project.community || null} />
              <DetailField icon={LandPlot} label="Lot / Block / Phase" value={lotBlockPhase} />
            </dl>
            {project.description && (
              <div className="flex flex-col gap-1 border-t pt-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</h3>
                <p className={`whitespace-pre-line text-sm leading-relaxed text-foreground ${longDescription ? 'line-clamp-3' : ''}`}>
                  {project.description}
                </p>
              </div>
            )}
            {(longDescription || project.legal_description || project.internal_notes) && (
              <details className="group border-t pt-3">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">View details</span>
                  <span className="hidden group-open:inline">Hide details</span>
                </summary>
                <div className="flex flex-col gap-4 pt-2">
                  {longDescription && (
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Full description</h3>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{project.description}</p>
                    </div>
                  )}
                  {project.legal_description && (
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Legal description</h3>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{project.legal_description}</p>
                    </div>
                  )}
                  {project.internal_notes && (
                    <div className="flex flex-col gap-1 rounded-xl bg-champagne-soft p-3">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-warning">Internal notes · staff only</h3>
                      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{project.internal_notes}</p>
                    </div>
                  )}
                </div>
              </details>
            )}
            {showsSetup && !setup.complete && setupDismissed && (
              <div className="border-t pt-2">
                <ShowSetupChecklistButton projectId={project.id} remaining={setup.steps.length - setup.doneCount} />
              </div>
            )}
          </section>
        </aside>
      </div>

      <section aria-labelledby="history-heading" className="surface flex flex-col gap-2 px-4 py-3 sm:px-5">
        <details id="status-history-details" className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-primary">
                <History className="size-4" aria-hidden="true" />
              </span>
              <h2 id="history-heading" className="scroll-mt-36 font-serif text-lg font-semibold text-foreground">
                Status history
              </h2>
              <span className="text-sm text-muted-foreground">
                {historyRes.error
                  ? 'Could not be loaded'
                  : `${history.length} ${history.length === 1 ? 'change' : 'changes'}${history.length === 30 ? ' (most recent)' : ''}`}
              </span>
            </span>
            <span className="text-sm font-medium text-primary">
              <span className="group-open:hidden">Show</span>
              <span className="hidden group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="pb-2 pt-4">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {historyRes.error ? 'Status history could not be loaded. Refresh the page to try again.' : 'No status changes recorded yet.'}
              </p>
            ) : (
              <ol className="relative flex flex-col gap-5 before:absolute before:bottom-4 before:left-[0.4375rem] before:top-4 before:w-px before:bg-[#D6DDE5]">
                {history.map((entry, index) => (
                  <li key={entry.id} className="relative flex flex-col gap-1.5 pl-8">
                    <span
                      className={
                        index === 0
                          ? 'absolute left-0 top-1 size-3.5 rounded-full border-[3px] border-card bg-primary ring-1 ring-primary/30'
                          : 'absolute left-0.5 top-1.5 size-2.5 rounded-full border-2 border-card bg-muted-foreground/40 ring-1 ring-border'
                      }
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold leading-5 text-foreground">
                        {entry.from_status ? (
                          <>
                            <span className="text-muted-foreground">{PROJECT_STATUS_LABELS[entry.from_status as ProjectStatus]}</span>
                            <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" />
                            <span>{PROJECT_STATUS_LABELS[entry.to_status as ProjectStatus]}</span>
                          </>
                        ) : (
                          `Created as ${PROJECT_STATUS_LABELS[entry.to_status as ProjectStatus]}`
                        )}
                      </p>
                      <time
                        dateTime={entry.created_at}
                        className="shrink-0 text-xs leading-5 tabular-nums text-muted-foreground sm:min-w-36 sm:text-right"
                      >
                        {formatDateTime(entry.created_at)}
                      </time>
                    </div>
                    {entry.note && (
                      <p className="rounded-lg bg-[#F3F4F6] px-3 py-2 text-sm leading-relaxed text-foreground/80">{entry.note}</p>
                    )}
                    <span className="text-xs text-muted-foreground">{`By ${nameFor(entry.changed_by) ?? 'System'}`}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </details>
      </section>
    </div>
  )
}
