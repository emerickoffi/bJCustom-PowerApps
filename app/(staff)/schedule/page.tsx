import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUp, CalendarDays as CalendarDaysIcon, CircleAlert } from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { PageHeader, EmptyState, pageLayout } from '@/components/shared/page-header'
import { ScheduleBody } from '@/components/schedule/schedule-selection'
import type { BoardGroup } from '@/components/schedule/schedule-board'
import { FilteredScheduleBoard } from '@/components/schedule/filtered-schedule-board'
import { InitializeScheduleButton } from '@/components/schedule/schedule-controls'
import {
  ACTIVITY_COLUMNS,
  findDateConflicts,
  todayIso,
  type ScheduleActivity,
  type ScheduleDependency,
  type SchedulePhase,
} from '@/lib/schedule'
import { UPCOMING_DAYS, addDaysIso, classifyActivity, type ScheduleFilter } from '@/lib/schedule-filters'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDate } from '@/lib/format'

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

const isOpen = (a: Pick<ScheduleActivity, 'status'>) => a.status !== 'completed' && a.status !== 'skipped'

function ScheduleShell({ children }: { children: React.ReactNode }) {
  return (
    <div data-schedule-page className={pageLayout('workspace', 'gap-4 md:gap-4')}>
      {children}
    </div>
  )
}

function SelectorPrompt({ title, message }: { title: string; message: string }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
      <ArrowUp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{`${title}. `}</span>
        {message}
      </p>
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

  // Selection comes from the URL only (driven by the top-bar project selector). Never guess or remember a project.
  const showAll = projectParam === 'all'
  const requestedId = showAll ? null : (projectParam ?? null)
  const selected = requestedId ? (projects.find((p) => p.id === requestedId) ?? null) : null
  const invalidSelection = Boolean(projectParam) && !showAll && !selected
  const renderedFor = projectParam ?? ''

  if (projectError) {
    return (
      <ScheduleShell>
        <PageHeader icon={CalendarDaysIcon} title="Schedule" />
        <LoadError message="Projects could not be retrieved. Refresh the page to try again. Nothing was changed." />
      </ScheduleShell>
    )
  }

  if (!showAll && !selected) {
    return (
      <ScheduleShell>
        <PageHeader icon={CalendarDaysIcon} title="Schedule" />
        <ScheduleBody renderedFor={renderedFor}>
          <SelectorPrompt
            title={invalidSelection ? 'Project not available' : 'No project selected'}
            message={
              invalidSelection
                ? "That project doesn't exist, was archived, or you don't have access to it. Choose another project from the project selector in the top bar."
                : 'Choose a project from the project selector in the top bar, or choose All projects for an overview.'
            }
          />
        </ScheduleBody>
      </ScheduleShell>
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
  const manager = canManage(session.role)

  const today = todayIso()
  const horizon = addDaysIso(today, UPCOMING_DAYS)
  const flags: Record<string, ScheduleFilter[]> = Object.fromEntries(
    activities.map((a) => [a.id, classifyActivity(a, today, horizon)]),
  )

  // Report-only: projects whose recorded status disagrees with their schedule records.
  const inconsistencies = visibleProjects
    .filter((p) => p.status === 'completed')
    .map((p) => {
      const list = activities.filter((a) => a.project_id === p.id)
      return { project: p, total: list.length, open: list.filter(isOpen).length, dated: list.filter((a) => a.planned_start || a.planned_end).length }
    })
    .filter((x) => x.total > 0 && x.open > 0)

  return (
    <ScheduleShell>
      <PageHeader icon={CalendarDaysIcon} title={selected ? `Schedule · ${selected.name}` : 'Schedule · All projects'} />

      <ScheduleBody renderedFor={renderedFor}>
        {loadFailed ? (
          <LoadError message="Schedule activities or their dependencies could not be retrieved, so totals are not shown. Refresh the page to try again. Nothing was changed." />
        ) : (
          <div className="flex flex-col gap-4">
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

            {groups.length > 0 ? (
              <FilteredScheduleBoard
                key={selected?.id ?? 'all'}
                mode={selected ? 'project' : 'all'}
                groups={groups}
                flags={flags}
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
          </div>
        )}
      </ScheduleBody>
    </ScheduleShell>
  )
}
