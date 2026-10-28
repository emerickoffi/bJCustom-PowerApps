import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  FolderOpen,
  Hammer,
  History,
  House,
  LandPlot,
  MapPin,
  Pencil,
  Trees,
  UserRound,
  Wallet,
} from 'lucide-react'
import { OverviewSection } from '@/components/projects/overview-section'
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
import { StatusChanger } from '@/components/projects/status-changer'
import { AssistantProjectScope } from '@/components/assistant/assistant-context'
import { ProjectWalkthroughsPanel } from '@/components/walkthroughs/project-walkthroughs-panel'
import { ProjectEstimatesPanel } from '@/components/estimates/project-estimates-panel'
import { ProjectSchedulePanel } from '@/components/schedule/project-schedule-panel'
import { ProjectInvoicesPanel } from '@/components/invoices/project-invoices-panel'
import {
  ProjectClientsPanel,
  ProjectTeamPanel,
  type ProjectClientLink,
} from '@/components/projects/project-people'
import { PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatAddress, formatCents, formatDate, formatDateTime } from '@/lib/format'
import { PROJECT_SECTION_ANCHORS } from '@/lib/project-nav'
import { ProjectSectionScroll } from '@/components/projects/project-section-scroll'

export const metadata: Metadata = { title: 'Project' }

function Fact({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-champagne">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-white/60">{label}</span>
        <span className="truncate text-sm font-medium text-white">{value}</span>
      </div>
    </div>
  )
}

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
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={value ? 'break-words text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}>{value ?? empty}</dd>
        {action}
      </div>
    </div>
  )
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff()
  const { id } = await params
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
  const [linksRes, membersRes, historyRes, staff, clientOptions, activitiesRes, openIssuesRes, photos] = await Promise.all([
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
    manager ? getClientOptions(session.organizationId) : Promise.resolve([]),
    supabase
      .from('schedule_activities')
      .select('name, status, planned_start, planned_end, sort_order')
      .eq('project_id', id)
      .order('sort_order'),
    supabase
      .from('project_issues')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', id)
      .neq('status', 'closed'),
    getProjectCoverPhotos([id]),
  ])

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
  const openIssues = openIssuesRes.count ?? 0
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

  return (
    <div className="flex flex-col gap-8">
      <ProjectSectionScroll />
      <AssistantProjectScope
        project={{ id: project.id, name: project.name, number: project.project_number ?? null, statusLabel: PROJECT_STATUS_LABELS[status] }}
      />
      <section aria-labelledby="project-heading" className="overflow-hidden rounded-3xl bg-brand-deep text-white shadow-lift">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="flex flex-col gap-8 p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-xs text-white/60">{project.project_number}</span>
                <ProjectStatusBadge status={status} />
              </div>
              <h1 id="project-heading" className="text-balance font-serif text-3xl font-semibold leading-tight md:text-4xl">
                {project.name}
              </h1>
              <p className="flex items-start gap-2 text-sm text-white/70">
                <MapPin className="mt-0.5 size-4 shrink-0 text-champagne" aria-hidden="true" />
                {formatAddress(project)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              {progress === null ? (
                <span className="flex size-[104px] shrink-0 items-center justify-center rounded-full border-[8px] border-white/15 px-2 text-center text-[0.7rem] font-medium leading-tight text-white/70">
                  Not configured
                </span>
              ) : (
                <ProgressRing value={progress} label="Construction progress" tone="light" size={104} stroke={8} />
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">
                  {progress === null
                    ? 'Construction progress not configured'
                    : `${completed} of ${counted.length} schedule steps complete`}
                </span>
                {progress === null && (
                  <span className="max-w-xs text-sm text-white/65">
                    Progress is calculated from weighted schedule milestones. Initialize the construction schedule to begin tracking.
                  </span>
                )}
                {nextUp && <span className="text-sm text-white/65">{`Next: ${nextUp.name}`}</span>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {delayed > 0 && (
                    <span className="flex items-center gap-1 rounded-full bg-champagne/20 px-2.5 py-0.5 text-xs font-medium text-champagne">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {`${delayed} delayed`}
                    </span>
                  )}
                  {openIssues > 0 && (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/85">
                      {`${openIssues} open ${openIssues === 1 ? 'issue' : 'issues'}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2 xl:grid-cols-4">
              <Fact icon={Wallet} label="Estimated budget" value={formatCents(project.estimated_budget_cents)} />
              <Fact icon={CalendarRange} label="Proposed start" value={formatDate(project.proposed_start_date)} />
              <Fact icon={CalendarClock} label="Target completion" value={formatDate(project.target_completion_date)} />
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
                  className="bg-champagne text-white hover:bg-champagne/90"
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
          <div className="relative min-h-56 lg:min-h-full">
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

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-8">
          <OverviewSection
            id="overview-heading"
            icon={House}
            title="Project details"
            subtitle="Property and construction information."
          >
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              <DetailField
                icon={Hammer}
                label="Project type"
                value={PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type ?? null}
              />
              <DetailField
                icon={UserRound}
                label="Project manager"
                value={managerName}
                empty="Not assigned"
                action={
                  !managerName && manager ? (
                    <Link href={`/projects/${project.id}/edit`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                      Assign manager
                    </Link>
                  ) : null
                }
              />
              <DetailField icon={Trees} label="Community" value={project.community || null} />
              <DetailField icon={LandPlot} label="Lot / Block / Phase" value={lotBlockPhase} />
            </dl>
            {project.description && (
              <div className="flex flex-col gap-1.5 border-t pt-5">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{project.description}</p>
              </div>
            )}
            {project.legal_description && (
              <div className="flex flex-col gap-1.5 border-t pt-5">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Legal description</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{project.legal_description}</p>
              </div>
            )}
            {project.internal_notes && (
              <div className="flex flex-col gap-1.5 rounded-xl bg-champagne-soft p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-warning">Internal notes · staff only</h3>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{project.internal_notes}</p>
              </div>
            )}
          </OverviewSection>

          {features.schedule && <ProjectSchedulePanel projectId={project.id} canManage={manager} progressPercent={progress} />}

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

          <OverviewSection
            id="history-heading"
            icon={History}
            title="Status history"
            subtitle="Project lifecycle changes and recorded transitions."
          >
            {(historyRes.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
            ) : (
              <ol className="relative flex flex-col gap-6 before:absolute before:bottom-3 before:left-[0.4375rem] before:top-3 before:w-px before:bg-border">
                {(historyRes.data ?? []).map((entry, index) => (
                  <li key={entry.id} className="relative flex flex-col gap-1.5 pl-8">
                    <span
                      className={
                        index === 0
                          ? 'absolute left-0 top-1 size-3.5 rounded-full border-[3px] border-card bg-primary ring-1 ring-primary/30'
                          : 'absolute left-0.5 top-1.5 size-2.5 rounded-full border-2 border-card bg-muted-foreground/40 ring-1 ring-border'
                      }
                      aria-hidden="true"
                    />
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
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
                      <time dateTime={entry.created_at} className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </time>
                    </div>
                    {entry.note && <p className="text-sm leading-relaxed text-muted-foreground">{entry.note}</p>}
                    <span className="text-xs text-muted-foreground">{`By ${nameFor(entry.changed_by) ?? 'System'}`}</span>
                  </li>
                ))}
              </ol>
            )}
          </OverviewSection>
        </div>

        <aside className="flex flex-col gap-6">
          {manager && (
            <section aria-labelledby="status-heading" className="surface flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 id="status-heading" className="font-serif text-lg font-semibold text-foreground">
                  Project status
                </h2>
                <ProjectStatusBadge status={status} />
              </div>
              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[#F8F7F3] p-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">Last updated</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {historyRes.data?.[0] ? formatDate(historyRes.data[0].created_at) : formatDate(project.updated_at ?? project.created_at)}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{project.completion_date ? 'Completed' : 'Target completion'}</dt>
                  <dd className="font-medium tabular-nums text-foreground">
                    {formatDate(project.completion_date ?? project.target_completion_date)}
                  </dd>
                </div>
              </dl>
              <StatusChanger projectId={project.id} status={status} />
              <a
                href="#history-heading"
                className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                <History className="size-3.5" aria-hidden="true" />
                View status history
              </a>
            </section>
          )}
          <ProjectClientsPanel projectId={project.id} links={links} clientOptions={clientOptions} canEdit={manager} />
          <div id={PROJECT_SECTION_ANCHORS.team} className="scroll-mt-24">
            <ProjectTeamPanel
              projectId={project.id}
              managerName={nameFor(project.project_manager_id)}
              members={members}
              staffOptions={staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))}
              canEdit={manager}
            />
          </div>
        </aside>
      </div>
    </div>
  )
}
