import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AlertTriangle, CalendarRange, Lock, CalendarDays as CalendarDaysIcon } from 'lucide-react'
import { requireStaff, canManage } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getStaffMembers } from '@/lib/queries'
import { PageHeader } from '@/components/shared/page-header'
import { ScheduleWorkspace } from '@/components/schedule/schedule-workspace'
import { BaselineForm, InitializeScheduleButton, OptionalActivitiesPanel } from '@/components/schedule/schedule-controls'
import { ProgressBar } from '@/components/schedule/schedule-badges'
import {
  ACTIVITY_COLUMNS,
  ACTIVITY_STATUS_LABELS,
  EVENT_FIELD_LABELS,
  findDateConflicts,
  isOverdue,
  type ActivityStatus,
  type ScheduleActivity,
  type ScheduleDependency,
} from '@/lib/schedule'
import { formatAddress, formatDate, formatDateTime } from '@/lib/format'

export const metadata: Metadata = { title: 'Schedule' }

type Change = { from: unknown; to: unknown }

function describeChange(field: string, change: Change, nameFor: (id: string | null) => string | null) {
  const fmt = (v: unknown) => {
    if (v === null || v === undefined || v === '') return '—'
    if (field === 'status') return ACTIVITY_STATUS_LABELS[v as ActivityStatus] ?? String(v)
    if (field === 'assigned_to') return nameFor(String(v)) ?? '—'
    if (field === 'percent_complete') return `${Math.round(Number(v))}%`
    if (field === 'is_published') return v ? 'Yes' : 'No'
    if (field.endsWith('_start') || field.endsWith('_end')) return formatDate(String(v))
    if (field === 'internal_notes' || field === 'delay_reason' || field === 'public_note') return 'updated'
    return String(v)
  }
  const label = EVENT_FIELD_LABELS[field] ?? field
  if (field === 'internal_notes' || field === 'public_note') return `${label} updated`
  return `${label}: ${fmt(change.from)} → ${fmt(change.to)}`
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
    .select('id, name, project_number, address_line1, address_line2, city, state, postal_code, progress_percent, target_completion_date')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()

  const manager = canManage(session.role)
  const [activitiesRes, depsRes, eventsRes, baselinesRes, staff] = await Promise.all([
    supabase.from('schedule_activities').select(ACTIVITY_COLUMNS).eq('project_id', id).order('sort_order').order('created_at'),
    supabase.from('schedule_dependencies').select('id, predecessor_id, successor_id').eq('project_id', id),
    supabase
      .from('schedule_activity_events')
      .select('id, activity_name, event_type, actor_id, changes, created_at')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('schedule_baselines')
      .select('id, version, name, notes, snapshot, created_by, created_at')
      .eq('project_id', id)
      .order('version', { ascending: false }),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
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
    <div className="flex flex-col gap-8">
      <PageHeader icon={CalendarDaysIcon}
        title="Construction schedule"
        description={formatAddress(project)}
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
          <section aria-label="Schedule summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Overall progress</span>
              {project.progress_percent === null ? (
                <span className="text-sm text-muted-foreground">Progress not configured · all activities have zero weight or are not applicable</span>
              ) : (
                <>
                  <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">{`${Math.round(Number(project.progress_percent))}%`}</span>
                  <ProgressBar value={Number(project.progress_percent)} label="Overall project progress" />
                </>
              )}
            </div>
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Activities complete</span>
              <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">{`${completed} / ${active.length}`}</span>
              <span className="text-xs text-muted-foreground">Weighted by milestone importance</span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Forecast completion</span>
              <span className="font-serif text-2xl font-semibold text-foreground">{formatDate(forecastEnd)}</span>
              <span className={slipDays && slipDays > 0 ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                {slipDays === null
                  ? `Target ${formatDate(project.target_completion_date)}`
                  : slipDays > 0
                    ? `${slipDays} days behind baseline v${latest?.version}`
                    : slipDays < 0
                      ? `${-slipDays} days ahead of baseline v${latest?.version}`
                      : `On baseline v${latest?.version}`}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border bg-card p-5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Needs attention</span>
              <span className="font-serif text-3xl font-semibold tabular-nums text-foreground">{delayed.length + conflictIds.length}</span>
              <span className="text-xs text-muted-foreground">{`${delayed.length} delayed or past due · ${conflictIds.length} date conflicts`}</span>
            </div>
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
          />

          <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
            <section aria-labelledby="schedule-history" className="flex flex-col gap-4">
              <h2 id="schedule-history" className="font-serif text-lg font-semibold text-foreground">
                Change history
              </h2>
              <ol className="flex flex-col rounded-xl border bg-card">
                {(eventsRes.data ?? []).map((e) => {
                  const changes = Object.entries((e.changes ?? {}) as Record<string, Change>)
                  return (
                    <li key={e.id} className="flex flex-col gap-1 border-b p-4 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {e.event_type === 'created' ? `Added ${e.activity_name}` : e.event_type === 'deleted' ? `Removed ${e.activity_name}` : e.activity_name}
                        </span>
                        <time dateTime={e.created_at} className="text-xs text-muted-foreground">
                          {formatDateTime(e.created_at)}
                        </time>
                      </div>
                      {changes.length > 0 && (
                        <ul className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                          {changes.map(([field, change]) => (
                            <li key={field}>{describeChange(field, change, nameFor)}</li>
                          ))}
                        </ul>
                      )}
                      <span className="text-xs text-muted-foreground">{`By ${nameFor(e.actor_id) ?? 'System'}`}</span>
                    </li>
                  )
                })}
              </ol>
            </section>

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
