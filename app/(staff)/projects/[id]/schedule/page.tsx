import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  ListChecks,
  Lock,
  MapPin,
  TrendingUp,
  CalendarDays as CalendarDaysIcon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { PageHeader } from '@/components/shared/page-header'
import { ScheduleWorkspace } from '@/components/schedule/schedule-workspace'
import { BaselineForm, InitializeScheduleButton, OptionalActivitiesPanel } from '@/components/schedule/schedule-controls'
import { ProgressBar } from '@/components/schedule/schedule-badges'
import {
  ACTIVITY_COLUMNS,
  findDateConflicts,
  isOverdue,
  type ScheduleActivity,
  type ScheduleDependency,
} from '@/lib/schedule'
import { formatAddress, formatDate } from '@/lib/format'
import { RECENT_HISTORY_LIMIT, presentEvent } from '@/lib/activity-history'
import { fetchRecentHistory, getOrgTimeZone } from '@/lib/activity-history-server'
import { ActivityHistoryCard } from '@/components/schedule/activity-history-card'
import { getOrgFeatures } from '@/lib/features'
import { loadProjectAssignments } from '@/lib/assignments-data'
import { ProjectAssignmentsCard } from '@/components/schedule/project-assignments-card'

export const metadata: Metadata = { title: 'Schedule' }

function KpiCard({
  icon: Icon,
  label,
  tone = 'default',
  children,
}: {
  icon: LucideIcon
  label: string
  tone?: 'default' | 'alert'
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-[#E2E8E2] bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[#103B27]/60">{label}</span>
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-lg',
            tone === 'alert' ? 'bg-[#FDE8E7] text-[#BD302B]' : 'bg-[#EAF0E9] text-[#174D32]',
          )}
          aria-hidden="true"
        >
          <Icon className="size-3.5" />
        </span>
      </div>
      {children}
    </div>
  )
}

function KpiValue({ muted = false, children }: { muted?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'font-serif text-2xl font-semibold leading-tight tabular-nums',
        muted ? 'text-[#103B27]/45' : 'text-[#103B27]',
      )}
    >
      {children}
    </span>
  )
}

function KpiNote({ tone = 'default', children }: { tone?: 'default' | 'alert'; children: React.ReactNode }) {
  return <span className={cn('text-xs', tone === 'alert' ? 'font-medium text-[#BD302B]' : 'text-muted-foreground')}>{children}</span>
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ setup?: string }>
}) {
  const session = await requireStaff()
  const { id } = await params
  const { setup } = await searchParams
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, project_number, status, address_line1, address_line2, city, state, postal_code, progress_percent, target_completion_date')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  const manager = canManage(session.role)
  const features = await getOrgFeatures(session.organizationId)
  const [activitiesRes, depsRes, recentHistory, timeZone, baselinesRes, staff, assignmentData] = await Promise.all([
    supabase.from('schedule_activities').select(ACTIVITY_COLUMNS).eq('project_id', id).order('sort_order').order('created_at'),
    supabase.from('schedule_dependencies').select('id, predecessor_id, successor_id').eq('project_id', id),
    fetchRecentHistory(supabase, id, RECENT_HISTORY_LIMIT),
    getOrgTimeZone(supabase, session.organizationId),
    supabase
      .from('schedule_baselines')
      .select('id, version, name, notes, snapshot, created_by, created_at')
      .eq('project_id', id)
      .order('version', { ascending: false }),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    loadProjectAssignments(supabase, session.organizationId, id, features, manager, project.status),
  ])

  const activities = (activitiesRes.data ?? []) as ScheduleActivity[]
  const dependencies = (depsRes.data ?? []) as ScheduleDependency[]
  const baselines = baselinesRes.data ?? []
  const staffOptions = staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))
  const nameFor = (uid: string | null) => {
    if (!uid) return null
    return staffOptions.find((s) => s.value === uid)?.label ?? 'Former team member'
  }

  const conflicts = findDateConflicts(activities, dependencies)
  const conflictIds = [...new Set(conflicts.map((c) => c.successor.id))]
  const active = activities.filter((a) => a.status !== 'skipped')
  const completed = active.filter((a) => a.status === 'completed').length
  const delayed = active.filter((a) => a.status === 'delayed' || isOverdue(a))
  const forecastEnd = active.reduce<string | null>((max, a) => {
    const d = a.actual_end ?? a.planned_end
    return d && (!max || d > max) ? d : max
  }, null)

  const address = formatAddress(project)
  const latest = baselines[0]
  const baselineEnd = latest
    ? ((latest.snapshot as { planned_end: string | null }[]).reduce<string | null>(
        (max, a) => (a.planned_end && (!max || a.planned_end > max) ? a.planned_end : max),
        null,
      ))
    : null
  const slipDays =
    baselineEnd && forecastEnd
      ? Math.round((new Date(`${forecastEnd}T00:00:00`).getTime() - new Date(`${baselineEnd}T00:00:00`).getTime()) / 86_400_000)
      : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarDaysIcon}
        eyebrow={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 normal-case tracking-normal">
            <span className="truncate font-medium text-[#103B27]">{project.name}</span>
            {project.project_number && <span className="font-mono">{project.project_number}</span>}
          </span>
        }
        title="Construction Schedule"
        description={
          address ? (
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              {address}
            </span>
          ) : undefined
        }
        actions={manager && activities.length > 0 && <InitializeScheduleButton projectId={project.id} label="Add missing template activities" />}
      />

      {setup === 'incomplete' && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
          <p className="leading-relaxed">
            The project was created, but schedule setup did not finish. Use the schedule controls on this page to add the
            template activities or optional activities. Nothing is duplicated if you retry.
          </p>
        </div>
      )}

      {activities.length === 0 ? (
        <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed bg-card p-8">
          <CalendarRange className="size-8 text-primary" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-serif text-xl font-semibold text-foreground">No schedule yet</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Construction progress is not configured for this project. Initialize the schedule from your organization&apos;s
              milestone template (with dependencies and progress weights), then adjust activities to fit this home. Existing
              activities are never duplicated, and no milestone is marked complete automatically.
            </p>
          </div>
          {manager ? (
            <InitializeScheduleButton projectId={project.id} label="Initialize Construction Schedule" />
          ) : (
            <p className="text-sm text-muted-foreground">Ask a project manager to set up the schedule.</p>
          )}
        </section>
      ) : (
        <>
          <section aria-label="Schedule summary" className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={TrendingUp} label="Overall progress">
              {project.progress_percent === null ? (
                <>
                  <KpiValue muted>Not configured</KpiValue>
                  <KpiNote>All activities have zero weight or are not applicable</KpiNote>
                </>
              ) : (
                <>
                  <KpiValue>{`${Math.round(Number(project.progress_percent))}%`}</KpiValue>
                  <ProgressBar value={Number(project.progress_percent)} label="Overall project progress" className="[&>span]:hidden" />
                </>
              )}
            </KpiCard>
            <KpiCard icon={ListChecks} label="Activities complete">
              <KpiValue>
                {completed}
                <span className="text-lg font-medium text-[#103B27]/45">{` / ${active.length}`}</span>
              </KpiValue>
              <KpiNote>{active.length === activities.length ? 'All scheduled activities' : 'Skipped activities excluded'}</KpiNote>
            </KpiCard>
            <KpiCard icon={CalendarClock} label="Forecast completion">
              {forecastEnd ? <KpiValue>{formatDate(forecastEnd)}</KpiValue> : <KpiValue muted>Not forecast yet</KpiValue>}
              {slipDays !== null && (
                <KpiNote tone={slipDays > 0 ? 'alert' : 'default'}>
                  {slipDays > 0
                    ? `${slipDays} days behind baseline v${latest?.version}`
                    : slipDays < 0
                      ? `${-slipDays} days ahead of baseline v${latest?.version}`
                      : `On baseline v${latest?.version}`}
                </KpiNote>
              )}
              <KpiNote>
                {project.target_completion_date ? `Target ${formatDate(project.target_completion_date)}` : 'No target date set'}
                {!forecastEnd && ' · forecast appears once activities have dates'}
              </KpiNote>
            </KpiCard>
            <KpiCard icon={AlertTriangle} label="Needs attention" tone={delayed.length + conflictIds.length > 0 ? 'alert' : 'default'}>
              <KpiValue muted={delayed.length + conflictIds.length === 0}>{delayed.length + conflictIds.length}</KpiValue>
              <KpiNote>
                {delayed.length + conflictIds.length === 0
                  ? 'Nothing delayed, past due or in conflict'
                  : `${delayed.length} delayed or past due · ${conflictIds.length} date conflicts`}
              </KpiNote>
            </KpiCard>
          </section>

          {conflicts.length > 0 && (
            <section role="alert" className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="size-4 text-warning-foreground" aria-hidden="true" />
                Dependency date conflicts
              </h2>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {conflicts.slice(0, 6).map((c) => (
                  <li key={`${c.predecessor.id}-${c.successor.id}`}>
                    {`${c.successor.name} starts ${formatDate(c.successor.actual_start ?? c.successor.planned_start)}, before ${c.predecessor.name} finishes ${formatDate(c.predecessor.actual_end ?? c.predecessor.planned_end)}.`}
                  </li>
                ))}
                {conflicts.length > 6 && <li>{`and ${conflicts.length - 6} more`}</li>}
              </ul>
            </section>
          )}

          <ScheduleWorkspace
            projectId={project.id}
            activities={activities}
            dependencies={dependencies}
            conflictIds={conflictIds}
            staffOptions={staffOptions}
            canManage={manager}
            assignmentAvailability={assignmentData.availability}
            assignments={assignmentData.assignments}
            companies={assignmentData.companies}
            acceptsNewAssignments={assignmentData.acceptsNew}
          />

          {assignmentData.availability !== 'off' && (
            <ProjectAssignmentsCard
              availability={assignmentData.availability}
              assignments={assignmentData.assignments}
              activities={activities}
            />
          )}

          <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
            <div className="min-w-0">
              <ActivityHistoryCard
                events={recentHistory.events.map((e) => presentEvent(e, nameFor, timeZone))}
                failed={recentHistory.failed}
                project={{ id: project.id, name: project.name, project_number: project.project_number }}
                actorOptions={staffOptions}
                canExport={manager}
              />
            </div>

            <aside className="flex flex-col gap-4">
              {manager && (
                <OptionalActivitiesPanel
                  projectId={project.id}
                  includedKeys={activities.map((a) => a.template_key).filter((k): k is string => !!k)}
                />
              )}
              <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
                <div className="flex flex-col gap-1">
                  <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
                    <Lock className="size-4 text-primary" aria-hidden="true" />
                    Approved baselines
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Baselines are locked snapshots of planned dates. Schedule edits never change them.
                  </p>
                </div>
                {baselines.length > 0 && (
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {baselines.map((b) => (
                      <li key={b.id} className="flex flex-col gap-0.5 p-3">
                        <span className="text-sm font-medium text-foreground">{`v${b.version} · ${b.name}`}</span>
                        <span className="text-xs text-muted-foreground">
                          {`${formatDate(b.created_at)} · ${nameFor(b.created_by) ?? 'System'} · ${(b.snapshot as unknown[]).length} activities`}
                        </span>
                        {b.notes && <p className="text-xs text-muted-foreground">{b.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                {manager && <BaselineForm projectId={project.id} nextVersion={(latest?.version ?? 0) + 1} />}
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
