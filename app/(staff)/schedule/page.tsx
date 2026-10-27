import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, CalendarRange, ListChecks, CalendarDays as CalendarDaysIcon } from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { PageHeader } from '@/components/shared/page-header'
import { ProjectFilter } from '@/components/schedule/project-filter'
import { PortfolioTimeline } from '@/components/schedule/portfolio-timeline'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { InitializeScheduleButton } from '@/components/schedule/schedule-controls'
import { ACTIVITY_COLUMNS, isOverdue, todayIso, type ScheduleActivity } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Schedule' }

type Activity = ScheduleActivity & { project_id: string }
type ProjectRow = { id: string; name: string; progress_percent: number | null }

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateRange(start: string | null, end: string | null) {
  if (!start && !end) return '—'
  return `${start ? formatDate(start) : '—'} – ${end ? formatDate(end) : '—'}`
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const session = await requireStaff()
  const { project: projectParam } = await searchParams
  const supabase = await createClient()

  const [{ data: projectData }, staff] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, progress_percent')
      .eq('organization_id', session.organizationId)
      .order('name'),
    getStaffMembers(session.organizationId),
  ])
  const projects = (projectData ?? []) as ProjectRow[]
  const selected = projects.find((p) => p.id === projectParam) ?? null

  let activityQuery = supabase
    .from('schedule_activities')
    .select(`${ACTIVITY_COLUMNS}, project_id`)
    .eq('organization_id', session.organizationId)
    .order('sort_order')
  if (selected) activityQuery = activityQuery.eq('project_id', selected.id)
  const { data: activityData } = await activityQuery
  const activities = (activityData ?? []) as unknown as Activity[]

  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const nameFor = (uid: string | null) => {
    if (!uid) return null
    const m = staff.find((s) => s.user_id === uid)
    return m ? m.full_name || m.email || 'Team member' : null
  }

  const today = todayIso()
  const horizon = addDays(today, 14)
  const overdue = activities
    .filter((a) => isOverdue(a, today))
    .sort((a, b) => (a.planned_end ?? '').localeCompare(b.planned_end ?? ''))
  const upcoming = activities
    .filter(
      (a) =>
        a.status !== 'completed' &&
        a.status !== 'skipped' &&
        a.planned_start &&
        a.planned_start >= today &&
        a.planned_start <= horizon,
    )
    .sort((a, b) => a.planned_start!.localeCompare(b.planned_start!))
  const inProgress = activities.filter((a) => a.status === 'in_progress').length

  const visibleProjects = selected ? [selected] : projects
  const timelineRows = visibleProjects.map((p) => ({
    id: p.id,
    name: p.name,
    activities: activities.filter((a) => a.project_id === p.id),
  }))
  const unscheduled = visibleProjects.filter((p) => !activities.some((a) => a.project_id === p.id))
  const listed = [...activities].sort(
    (a, b) =>
      (projectName.get(a.project_id) ?? '').localeCompare(projectName.get(b.project_id) ?? '') ||
      a.sort_order - b.sort_order,
  )
  const manager = canManage(session.role)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={CalendarDaysIcon}
        eyebrow="Workspace"
        title="Schedule"
        description="Construction activities across every project you can access. Updates here and in each project's tracker share the same records."
        actions={<ProjectFilter projects={projects.map(({ id, name }) => ({ id, name }))} />}
      />

      <section aria-label="Schedule summary" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Activities', value: activities.length, icon: ListChecks },
          { label: 'In progress', value: inProgress, icon: CalendarRange },
          { label: 'Overdue', value: overdue.length, icon: AlertTriangle, alert: overdue.length > 0 },
          { label: 'Starting in 14 days', value: upcoming.length, icon: CalendarClock },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <s.icon className={s.alert ? 'size-4 text-destructive' : 'size-4'} aria-hidden="true" />
              {s.label}
            </span>
            <span className={`font-serif text-3xl font-semibold tabular-nums ${s.alert ? 'text-destructive' : 'text-foreground'}`}>
              {s.value}
            </span>
          </div>
        ))}
      </section>

      {unscheduled.length > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-5">
          <h2 className="text-sm font-semibold text-foreground">Progress not configured</h2>
          <p className="text-sm text-muted-foreground">
            These projects have no construction schedule yet, so completion can&apos;t be calculated. Initializing adds the
            standard milestones as not started. Nothing is marked complete automatically.
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {unscheduled.map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/projects/${p.id}/schedule`} className="text-sm font-medium text-foreground hover:text-primary">
                  {p.name}
                </Link>
                {manager && <InitializeScheduleButton projectId={p.id} label="Initialize Construction Schedule" />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-serif text-xl font-semibold text-foreground">Construction timeline</h2>
        <PortfolioTimeline rows={timelineRows} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityPanel
          title="Overdue milestones"
          empty="Nothing is overdue."
          items={overdue}
          projectName={projectName}
          dateLabel={(a) => `Due ${formatDate(a.planned_end!)}`}
          tone="alert"
        />
        <ActivityPanel
          title="Upcoming activities"
          empty="Nothing scheduled to start in the next 14 days."
          items={upcoming}
          projectName={projectName}
          dateLabel={(a) => `Starts ${formatDate(a.planned_start!)}`}
        />
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="font-serif text-xl font-semibold text-foreground">Schedule list</h2>
        {listed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No schedule activities yet.
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Activity</th>
                    {!selected && <th scope="col" className="px-4 py-3 font-medium">Project</th>}
                    <th scope="col" className="px-4 py-3 font-medium">Planned</th>
                    <th scope="col" className="px-4 py-3 font-medium">Actual</th>
                    <th scope="col" className="px-4 py-3 font-medium">Assigned</th>
                    <th scope="col" className="px-4 py-3 font-medium">Progress</th>
                    <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {listed.map((a) => (
                    <tr key={a.id} className={isOverdue(a, today) ? 'bg-destructive/5' : undefined}>
                      <td className="px-4 py-3">
                        <Link href={`/projects/${a.project_id}/schedule`} className="font-medium text-foreground hover:text-primary">
                          {a.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{a.phase}</div>
                      </td>
                      {!selected && <td className="px-4 py-3 text-muted-foreground">{projectName.get(a.project_id)}</td>}
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateRange(a.planned_start, a.planned_end)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateRange(a.actual_start, a.actual_end)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{nameFor(a.assigned_to) ?? 'Unassigned'}</td>
                      <td className="px-4 py-3 tabular-nums">{`${Math.round(Number(a.percent_complete))}%`}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ActivityStatusBadge status={a.status} />
                          {isOverdue(a, today) && <span className="text-xs font-medium text-destructive">Overdue</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="flex flex-col gap-3 md:hidden">
              {listed.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <Link href={`/projects/${a.project_id}/schedule`} className="font-medium text-foreground">
                        {a.name}
                      </Link>
                      <span className="text-xs text-muted-foreground">{`${projectName.get(a.project_id) ?? ''} · ${a.phase}`}</span>
                    </div>
                    <ActivityStatusBadge status={a.status} />
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-xs">
                    <div><dt className="text-muted-foreground">Planned</dt><dd>{dateRange(a.planned_start, a.planned_end)}</dd></div>
                    <div><dt className="text-muted-foreground">Actual</dt><dd>{dateRange(a.actual_start, a.actual_end)}</dd></div>
                    <div><dt className="text-muted-foreground">Assigned</dt><dd>{nameFor(a.assigned_to) ?? 'Unassigned'}</dd></div>
                    <div><dt className="text-muted-foreground">Progress</dt><dd>{`${Math.round(Number(a.percent_complete))}%`}</dd></div>
                  </dl>
                  {isOverdue(a, today) && <span className="text-xs font-medium text-destructive">Overdue</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function ActivityPanel({
  title,
  empty,
  items,
  projectName,
  dateLabel,
  tone,
}: {
  title: string
  empty: string
  items: Activity[]
  projectName: Map<string, string>
  dateLabel: (a: Activity) => string
  tone?: 'alert'
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {title}
        <span className={`rounded-full px-2 py-0.5 text-xs tabular-nums ${tone === 'alert' && items.length ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
          {items.length}
        </span>
      </h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex min-w-0 flex-col">
                <Link href={`/projects/${a.project_id}/schedule`} className="truncate text-sm font-medium text-foreground hover:text-primary">
                  {a.name}
                </Link>
                <span className="truncate text-xs text-muted-foreground">{projectName.get(a.project_id)}</span>
              </div>
              <span className={`shrink-0 text-xs tabular-nums ${tone === 'alert' ? 'text-destructive' : 'text-muted-foreground'}`}>
                {dateLabel(a)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
