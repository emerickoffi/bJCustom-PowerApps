import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays as CalendarDaysIcon,
  CalendarRange,
  CircleAlert,
  ListChecks,
} from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { ProjectFilter } from '@/components/schedule/project-filter'
import { ScheduleBody, ScheduleSelectionProvider } from '@/components/schedule/schedule-selection'
import { ScheduleBoard, type BoardGroup } from '@/components/schedule/schedule-board'
import { InitializeScheduleButton } from '@/components/schedule/schedule-controls'
import {
  ACTIVITY_COLUMNS,
  findDateConflicts,
  isOverdue,
  todayIso,
  type ScheduleActivity,
  type ScheduleDependency,
  type SchedulePhase,
} from '@/lib/schedule'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Schedule' }

type Activity = ScheduleActivity & { project_id: string }
type ProjectRow = {
  id: string
  name: string
  project_number: string | null
  status: ProjectStatus
  progress_percent: number | null
  completion_date: string | null
}

const UPCOMING_DAYS = 14

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isOpen = (a: Pick<ScheduleActivity, 'status'>) => a.status !== 'completed' && a.status !== 'skipped'

function ScheduleShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-schedule-page className="flex flex-col gap-5">
      {children}
    </div>
  )
}

/** White header surface; overrides the shared plain header's own divider so only this border shows. */
function HeaderSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#D6DDE5] bg-white px-4 py-3.5 md:px-5 md:py-4 [&>header]:border-b-0 [&>header]:pb-0 [&_h1]:text-[#17212B] [&_h1~div]:text-[#526173]">
      {children}
    </div>
  )
}

function LoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#F5C7C5] bg-white p-4 text-sm">
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#BD302B]" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold text-[#17212B]">Schedule couldn&apos;t be loaded</p>
        <p className="text-[#526173]">{message}</p>
      </div>
    </div>
  )
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requireStaff()
  const { project: projectParam } = await searchParams
  const supabase = await createClient()

  const [{ data: projectData, error: projectError }, { data: countData, error: countError }, staff] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status, progress_percent, completion_date')
      .eq('organization_id', session.organizationId)
      .is('archived_at', null)
      .order('name'),
    supabase.from('schedule_activities').select('project_id').eq('organization_id', session.organizationId).limit(5000),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
  ])
  const projects = (projectData ?? []) as ProjectRow[]

  const activityCount = new Map<string, number>()
  for (const a of (countData ?? []) as { project_id: string }[]) {
    activityCount.set(a.project_id, (activityCount.get(a.project_id) ?? 0) + 1)
  }

  // Selection comes from the URL only. Never guess or remember a project.
  const showAll = projectParam === 'all'
  const requestedId = showAll ? null : (projectParam ?? null)
  const selected = requestedId ? (projects.find((p) => p.id === requestedId) ?? null) : null
  const invalidSelection = Boolean(projectParam) && !showAll && !selected
  const filterProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    // A failed count query must not label every project "No schedule".
    meta: countError ? undefined : activityCount.has(p.id) ? PROJECT_STATUS_LABELS[p.status] : 'No schedule',
  }))

  if (projectError) {
    return (
      <ScheduleSelectionProvider>
        <ScheduleShell>
          <HeaderSurface>
            <PageHeader tone="plain" icon={CalendarDaysIcon} eyebrow="Workspace" title="Schedule" />
          </HeaderSurface>
          <LoadError message="Projects could not be retrieved. Refresh the page to try again. Nothing was changed." />
        </ScheduleShell>
      </ScheduleSelectionProvider>
    )
  }

  if (!showAll && !selected) {
    return (
      <ScheduleSelectionProvider>
        <ScheduleShell>
          <HeaderSurface>
            <PageHeader
              tone="plain"
              icon={CalendarDaysIcon}
              eyebrow="Workspace"
              title="Schedule"
              description="Choose a project to view and manage its construction activities."
              actions={<ProjectFilter value="" projects={filterProjects} />}
            />
          </HeaderSurface>
          <ScheduleBody>
            <div className="rounded-xl bg-white">
              <EmptyState
                icon={CalendarDaysIcon}
                title={invalidSelection ? 'Project not available' : 'Select a project'}
                description={
                  invalidSelection
                    ? 'That project does not exist, was archived, or you do not have access to it. Choose another project to continue.'
                    : 'Pick a project from the selector to see its schedule, or choose All projects for an overview.'
                }
              />
            </div>
          </ScheduleBody>
        </ScheduleShell>
      </ScheduleSelectionProvider>
    )
  }

  const visibleProjects = selected ? [selected] : projects
  const visibleIds = new Set(visibleProjects.map((p) => p.id))
  let activityQuery = supabase
    .from('schedule_activities')
    .select(`${ACTIVITY_COLUMNS}, project_id`)
    .eq('organization_id', session.organizationId)
  if (selected) activityQuery = activityQuery.eq('project_id', selected.id)
  const { data: activityData, error: activityError } = await activityQuery.order('sort_order').order('created_at').limit(5000)
  const activities = (activityData ?? []) as unknown as Activity[]
  const allActivities = activities

  const { data: depData, error: depError } = visibleIds.size
    ? await supabase
        .from('schedule_dependencies')
        .select('id, predecessor_id, successor_id, project_id')
        .in('project_id', [...visibleIds])
    : { data: [], error: null }
  const dependencies = (depData ?? []) as (ScheduleDependency & { project_id: string })[]
  const { data: phaseData } = visibleIds.size
    ? await supabase
        .from('schedule_phases')
        .select('id, name, sort_order, project_id')
        .in('project_id', [...visibleIds])
        .order('sort_order')
        .order('created_at')
    : { data: [] }
  const phases = (phaseData ?? []) as (SchedulePhase & { project_id: string })[]
  const loadFailed = Boolean(activityError || depError)

  const groups: BoardGroup[] = visibleProjects
    .map((p) => ({
      project: { id: p.id, name: p.name, statusLabel: PROJECT_STATUS_LABELS[p.status] ?? p.status },
      activities: activities.filter((a) => a.project_id === p.id),
      dependencies: dependencies.filter((d) => d.project_id === p.id),
      phases: phases.filter((ph) => ph.project_id === p.id),
    }))
    .filter((g) => g.activities.length > 0)
  const conflictIds = groups.flatMap((g) =>
    findDateConflicts(g.activities, g.dependencies).flatMap((c) => [c.predecessor.id, c.successor.id]),
  )
  const unscheduled = visibleProjects.filter((p) => !activityCount.has(p.id))

  const staffOptions = staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const manager = canManage(session.role)

  const today = todayIso()
  const horizon = addDays(today, UPCOMING_DAYS)
  const overdue = activities.filter((a) => isOverdue(a, today))
  const inProgress = activities.filter((a) => a.status === 'in_progress')
  const notScheduled = activities.filter((a) => !a.planned_start && !a.planned_end).length
  const upcoming = activities
    .filter(isOpen)
    .map((a) => ({ a, on: [a.planned_start, a.planned_end].find((d) => d && d >= today && d <= horizon) ?? null }))
    .filter((x): x is { a: Activity; on: string } => x.on !== null)
    .sort((x, y) => x.on.localeCompare(y.on))

  // Report-only: projects whose recorded status disagrees with their schedule records.
  const inconsistencies = visibleProjects
    .filter((p) => p.status === 'completed')
    .map((p) => {
      const list = allActivities.filter((a) => a.project_id === p.id)
      return { project: p, total: list.length, open: list.filter(isOpen).length, dated: list.filter((a) => a.planned_start || a.planned_end).length }
    })
    .filter((x) => x.total > 0 && x.open > 0)

  const metrics = [
    { label: 'Total activities', value: activities.length, icon: ListChecks, iconTone: 'bg-interactive-soft text-primary', hint: notScheduled ? `${notScheduled} not scheduled` : 'All scheduled' },
    { label: 'In progress', value: inProgress.length, icon: CalendarRange, iconTone: 'bg-[#E6F0FF] text-[#1D5FBD]', hint: inProgress.length ? null : 'None underway' },
    { label: 'Overdue', value: overdue.length, icon: AlertTriangle, iconTone: 'bg-[#FDE8E7] text-[#BD302B]', hint: 'Past planned finish', alert: overdue.length > 0 },
    { label: 'Upcoming', value: upcoming.length, icon: CalendarClock, iconTone: 'bg-link-soft text-link', hint: `Next ${UPCOMING_DAYS} days` },
  ]

  return (
    <ScheduleSelectionProvider>
      <ScheduleShell>
        <HeaderSurface>
          <PageHeader
            tone="plain"
            icon={CalendarDaysIcon}
            eyebrow={selected ? 'Project schedule' : 'Workspace'}
            title="Schedule"
            description={
              selected
                ? `Construction activities for ${selected.name}. Open an activity to edit it in the project schedule.`
                : 'All projects, grouped by project. Open an activity to edit it in its project schedule.'
            }
            actions={<ProjectFilter value={selected ? selected.id : 'all'} projects={filterProjects} />}
          />
          {selected && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[#E4E9EF] pt-3 text-sm text-[#526173]">
              <span className="font-semibold text-[#17212B]">{selected.name}</span>
              {selected.project_number && <span className="font-mono text-xs tabular-nums">{selected.project_number}</span>}
              <span className="rounded-full border border-[#D6DDE5] bg-[#F3F4F6] px-2.5 py-0.5 text-xs font-medium text-[#17212B]">
                {PROJECT_STATUS_LABELS[selected.status]}
              </span>
            </div>
          )}
        </HeaderSurface>

        <ScheduleBody>
          {loadFailed ? (
            <LoadError message="Schedule activities or their dependencies could not be retrieved, so totals are not shown. Refresh the page to try again. Nothing was changed." />
          ) : (
            <>
              <section aria-label="Schedule summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {metrics.map((m) => (
                  <div key={m.label} className="flex flex-col gap-1 rounded-xl border border-[#D6DDE5] bg-white p-3.5 sm:p-4">
                    <span className="flex items-center gap-2 text-xs font-medium text-[#526173]">
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', m.iconTone)} aria-hidden="true">
                        <m.icon className="size-4" />
                      </span>
                      {m.label}
                    </span>
                    <span className={cn('font-serif text-2xl font-semibold tabular-nums', m.alert ? 'text-[#BD302B]' : 'text-[#17212B]')}>
                      {m.value}
                    </span>
                    {m.hint && <span className="text-xs text-[#526173]">{m.hint}</span>}
                  </div>
                ))}
              </section>

              {inconsistencies.map(({ project, total, open, dated }) => (
                <div key={project.id} role="status" className="flex gap-3 rounded-xl border border-warning/40 bg-white p-4 text-sm">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                  <div className="flex flex-col gap-1">
                    <p className="font-semibold text-[#17212B]">{`${project.name}: status and schedule disagree`}</p>
                    <p className="text-[#526173]">
                      {`This project is marked Completed${project.completion_date ? ` (${formatDate(project.completion_date)})` : ''}, but ${open} of ${total} schedule activities are still open${dated === 0 ? ' and none have planned dates' : ''}. Recorded progress is ${Math.round(Number(project.progress_percent ?? 0))}%. Nothing was changed automatically. Update the activities or the project status to reconcile them.`}
                    </p>
                  </div>
                </div>
              ))}

              {upcoming.length > 0 && (
                <section aria-labelledby="upcoming-heading" className="overflow-hidden rounded-xl border border-[#D6DDE5] bg-white">
                  <h2 id="upcoming-heading" className="border-b border-[#D6DDE5] bg-[#E9EDF2] px-4 py-2.5 text-sm font-semibold text-[#17212B]">
                    {`Upcoming in the next ${UPCOMING_DAYS} days`}
                  </h2>
                  <ul className="flex flex-col divide-y divide-[#E4E9EF]">
                    {upcoming.slice(0, 6).map(({ a, on }) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <span className="flex min-w-0 flex-col">
                          <Link
                            href={`/projects/${a.project_id}/schedule?activity=${encodeURIComponent(a.id)}`}
                            className="w-fit rounded text-sm font-medium text-[#006B78] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006B78] focus-visible:ring-offset-2"
                          >
                            {a.name}
                          </Link>
                          <span className="truncate text-xs text-[#526173]">
                            {selected ? a.phase : `${projectName.get(a.project_id)} · ${a.phase}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-[#526173]">
                          {`${on === a.planned_start ? 'Starts' : 'Due'} ${formatDate(on)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {groups.length > 0 ? (
                <ScheduleBoard
                  key={selected?.id ?? 'all'}
                  mode={selected ? 'project' : 'all'}
                  groups={groups}
                  staffOptions={staffOptions}
                  conflictIds={conflictIds}
                  canManage={manager}
                />
              ) : (
                <div className="rounded-xl bg-white">
                  {selected ? (
                    <EmptyState
                      icon={CalendarDaysIcon}
                      title="No schedule activities yet"
                      description={`${selected.name} has no construction schedule, so progress can't be calculated. Initializing adds the standard milestones as not started. Nothing is marked complete automatically.`}
                      action={manager ? <InitializeScheduleButton projectId={selected.id} label="Initialize Construction Schedule" /> : undefined}
                    />
                  ) : (
                    <EmptyState icon={CalendarDaysIcon} title="No schedule activities yet" description="None of your projects have a construction schedule yet." />
                  )}
                </div>
              )}

              {!selected && !countError && unscheduled.length > 0 && (
                <section className="flex flex-col gap-2 rounded-xl border border-dashed border-[#C5CED9] bg-white p-4">
                  <h2 className="text-sm font-semibold text-[#17212B]">{`Projects without a schedule (${unscheduled.length})`}</h2>
                  <ul className="flex flex-col divide-y divide-[#E4E9EF]">
                    {unscheduled.map((p) => (
                      <li key={p.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <Link
                          href={`/schedule?project=${p.id}`}
                          className="w-fit rounded text-sm font-medium text-[#006B78] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006B78] focus-visible:ring-offset-2"
                        >
                          {p.name}
                        </Link>
                        {manager && <InitializeScheduleButton projectId={p.id} label="Initialize Construction Schedule" />}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </ScheduleBody>
      </ScheduleShell>
    </ScheduleSelectionProvider>
  )
}
