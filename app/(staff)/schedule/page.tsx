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
import { ScheduleSelectionState } from '@/components/schedule/schedule-selection-state'
import { ALL_PROJECTS, resolveScheduleSelection, scheduleHref } from '@/lib/schedule-selection'
import { ScheduleBoard, type BoardGroup } from '@/components/schedule/schedule-board'
import { InitializeScheduleButton } from '@/components/schedule/schedule-controls'
import {
  ACTIVITY_COLUMNS,
  findDateConflicts,
  isOverdue,
  todayIso,
  type ScheduleActivity,
  type ScheduleDependency,
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

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string | string[]; project?: string | string[] }>
}) {
  const session = await requireStaff()
  const params = await searchParams
  const supabase = await createClient()

  // Only projects this staff member can access (org-scoped, enforced again by RLS) are selectable.
  const [{ data: projectData }, { data: countData }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status, progress_percent, completion_date')
      .eq('organization_id', session.organizationId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('schedule_activities')
      .select('project_id')
      .eq('organization_id', session.organizationId)
      .limit(5000),
  ])
  const projects = (projectData ?? []) as ProjectRow[]

  const activityCount = new Map<string, number>()
  for (const a of (countData ?? []) as { project_id: string }[]) {
    activityCount.set(a.project_id, (activityCount.get(a.project_id) ?? 0) + 1)
  }

  const selection = resolveScheduleSelection(params, projects.map((p) => p.id))
  const projectOptions = projects.map((p) => ({
    id: p.id,
    name: p.name,
    meta: activityCount.has(p.id) ? PROJECT_STATUS_LABELS[p.status] : 'No schedule',
  }))

  if (selection.kind === 'none' || selection.kind === 'unavailable') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          icon={CalendarDaysIcon}
          eyebrow="Workspace"
          title="Schedule"
          description="Choose a project to view and update its construction schedule."
          actions={<ProjectFilter value="" projects={projectOptions} emphasize />}
        />
        <ScheduleSelectionState unavailable={selection.kind === 'unavailable'} hasProjects={projects.length > 0} />
      </div>
    )
  }

  const selected = selection.kind === 'project' ? (projects.find((p) => p.id === selection.projectId) ?? null) : null
  const visibleProjects = selected ? [selected] : projects
  const visibleIds = [...new Set(visibleProjects.map((p) => p.id))]

  const [{ data: activityData }, { data: depData }, staff] = await Promise.all([
    visibleIds.length
      ? supabase
          .from('schedule_activities')
          .select(`${ACTIVITY_COLUMNS}, project_id`)
          .eq('organization_id', session.organizationId)
          .in('project_id', visibleIds)
          .order('sort_order')
          .order('created_at')
          .limit(5000)
      : Promise.resolve({ data: [] }),
    visibleIds.length
      ? supabase
          .from('schedule_dependencies')
          .select('id, predecessor_id, successor_id, project_id')
          .in('project_id', visibleIds)
      : Promise.resolve({ data: [] }),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
  ])
  const visibleIdSet = new Set(visibleIds)
  // Defense in depth: drop anything outside the selected scope before it reaches the UI.
  const activities = ((activityData ?? []) as unknown as Activity[]).filter((a) => visibleIdSet.has(a.project_id))
  const dependencies = ((depData ?? []) as (ScheduleDependency & { project_id: string })[]).filter((d) =>
    visibleIdSet.has(d.project_id),
  )

  const groups: BoardGroup[] = visibleProjects
    .map((p) => ({
      project: { id: p.id, name: p.name, statusLabel: PROJECT_STATUS_LABELS[p.status] ?? p.status },
      activities: activities.filter((a) => a.project_id === p.id),
      dependencies: dependencies.filter((d) => d.project_id === p.id),
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
      const list = activities.filter((a) => a.project_id === p.id)
      return { project: p, total: list.length, open: list.filter(isOpen).length, dated: list.filter((a) => a.planned_start || a.planned_end).length }
    })
    .filter((x) => x.total > 0 && x.open > 0)

  const metrics = [
    { label: 'Total activities', value: activities.length, icon: ListChecks, iconTone: 'bg-[#174D32]/10 text-[#174D32]', hint: notScheduled ? `${notScheduled} not scheduled` : 'All scheduled' },
    { label: 'In progress', value: inProgress.length, icon: CalendarRange, iconTone: 'bg-[#E6F0FF] text-[#1D5FBD]', hint: inProgress.length ? null : 'None underway' },
    { label: 'Overdue', value: overdue.length, icon: AlertTriangle, iconTone: 'bg-[#FDE8E7] text-[#BD302B]', hint: 'Past planned finish', alert: overdue.length > 0 },
    { label: 'Upcoming', value: upcoming.length, icon: CalendarClock, iconTone: 'bg-[#FFF2DA] text-[#96570E]', hint: `Next ${UPCOMING_DAYS} days` },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarDaysIcon}
        eyebrow="Workspace"
        title="Schedule"
        description={
          selected
            ? `Construction activities for ${selected.name}. Changes here update the same records as the project tracker.`
            : 'All projects, grouped by project. Changes here update the same records as each project tracker.'
        }
        actions={
          <ProjectFilter value={selected ? selected.id : ALL_PROJECTS} projects={projectOptions} />
        }
      />

      {selected && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {selected.project_number && <span className="font-medium tabular-nums text-foreground">{selected.project_number}</span>}
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
            {PROJECT_STATUS_LABELS[selected.status]}
          </span>
          <Link href={`/projects/${selected.id}/schedule`} className="font-medium text-primary hover:underline">
            Open project tracker
          </Link>
        </div>
      )}

      <section aria-label="Schedule summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4">
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', m.iconTone)} aria-hidden="true">
                <m.icon className="size-4" />
              </span>
              {m.label}
            </span>
            <span className={cn('font-serif text-2xl font-semibold tabular-nums sm:text-3xl', m.alert ? 'text-destructive' : 'text-foreground')}>
              {m.value}
            </span>
            {m.hint && <span className="text-xs text-muted-foreground">{m.hint}</span>}
          </div>
        ))}
      </section>

      {inconsistencies.map(({ project, total, open, dated }) => (
        <div
          key={project.id}
          role="status"
          className="flex gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-foreground">{`${project.name}: status and schedule disagree`}</p>
            <p className="text-muted-foreground">
              {`This project is marked Completed${project.completion_date ? ` (${formatDate(project.completion_date)})` : ''}, but ${open} of ${total} schedule activities are still open${dated === 0 ? ' and none have planned dates' : ''}. Recorded progress is ${Math.round(Number(project.progress_percent ?? 0))}%. Nothing was changed automatically. Update the activities or the project status to reconcile them.`}
            </p>
          </div>
        </div>
      ))}

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading" className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <h2 id="upcoming-heading" className="text-sm font-semibold text-foreground">
            {`Upcoming in the next ${UPCOMING_DAYS} days`}
          </h2>
          <ul className="flex flex-col divide-y divide-border">
            {upcoming.slice(0, 6).map(({ a, on }) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {selected ? a.phase : `${projectName.get(a.project_id)} · ${a.phase}`}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
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
      ) : selected ? (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No schedule activities yet"
          description={`${selected.name} has no construction schedule, so progress can't be calculated. Initializing adds the standard milestones as not started. Nothing is marked complete automatically.`}
          action={manager ? <InitializeScheduleButton projectId={selected.id} label="Initialize Construction Schedule" /> : undefined}
        />
      ) : (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No schedule activities yet"
          description="None of your projects have a construction schedule yet."
        />
      )}

      {!selected && unscheduled.length > 0 && (
        <section className="flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4">
          <h2 className="text-sm font-semibold text-foreground">{`Projects without a schedule (${unscheduled.length})`}</h2>
          <ul className="flex flex-col divide-y divide-border">
            {unscheduled.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <Link href={scheduleHref(p.id)} className="text-sm font-medium text-foreground hover:text-primary">
                  {p.name}
                </Link>
                {manager && <InitializeScheduleButton projectId={p.id} label="Initialize Construction Schedule" />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
