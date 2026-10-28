'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, Diamond, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { ActivityStatusBadge, ProgressBar, STATUS_BAR_TONE } from '@/components/schedule/schedule-badges'
import { ACTIVITY_TYPE_LABELS, isOverdue, todayIso, type ScheduleActivity, type ScheduleDependency } from '@/lib/schedule'
import { formatDate } from '@/lib/format'

type ViewProps = {
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  conflictIds: Set<string>
  nameFor: (userId: string | null) => string | null
  onSelect: (activity: ScheduleActivity) => void
}

const DAY = 86_400_000
const toTime = (iso: string) => new Date(`${iso}T00:00:00`).getTime()

export function groupByPhase(activities: ScheduleActivity[]) {
  const groups: { phase: string; items: ScheduleActivity[] }[] = []
  for (const a of activities) {
    const last = groups[groups.length - 1]
    if (last && last.phase === a.phase) last.items.push(a)
    else groups.push({ phase: a.phase, items: [a] })
  }
  return groups
}

export function Flags({ activity, conflict, today }: { activity: ScheduleActivity; conflict: boolean; today: string }) {
  const overdue = isOverdue(activity, today)
  if (!overdue && !conflict) return null
  return (
    <span className="flex flex-wrap gap-1">
      {overdue && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlertTriangle className="size-3" aria-hidden="true" />
          Past due
        </span>
      )}
      {conflict && (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
          <Link2 className="size-3" aria-hidden="true" />
          Date conflict
        </span>
      )}
    </span>
  )
}

export function ScheduleTimeline({ activities, dependencies, conflictIds, onSelect }: ViewProps) {
  const today = todayIso()
  const dated = activities.filter((a) => a.planned_start || a.planned_end)
  const range = useMemo(() => {
    const times = dated.flatMap((a) =>
      [a.planned_start, a.planned_end, a.actual_start, a.actual_end].filter(Boolean).map((d) => toTime(d as string)),
    )
    if (!times.length) return null
    const start = Math.min(...times, toTime(today)) - 7 * DAY
    const end = Math.max(...times, toTime(today)) + 7 * DAY
    return { start, end, span: end - start }
  }, [dated, today])

  if (!range) {
    const undated = activities.length
    return (
      <EmptyState
        icon={CalendarRange}
        title={undated ? 'Activities need planned dates' : 'No activities yet'}
        description={
          undated
            ? `${undated} ${undated === 1 ? 'activity has' : 'activities have'} no planned start or finish date. Open an activity from the List view and set its planned dates to place it on the timeline.`
            : 'Add schedule activities with planned start and finish dates to build the construction timeline.'
        }
        action={
          undated ? (
            <Button variant="outline" size="sm" onClick={() => onSelect(activities[0])}>
              Set dates for {activities[0].name}
            </Button>
          ) : undefined
        }
      />
    )
  }

  const pct = (iso: string) => ((toTime(iso) - range.start) / range.span) * 100
  const months: { label: string; left: number }[] = []
  const cursor = new Date(range.start)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + 1)
  while (cursor.getTime() < range.end) {
    months.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      left: ((cursor.getTime() - range.start) / range.span) * 100,
    })
    cursor.setMonth(cursor.getMonth() + 1)
  }
  const predCount = new Map<string, number>()
  for (const d of dependencies) predCount.set(d.successor_id, (predCount.get(d.successor_id) ?? 0) + 1)
  const todayLeft = pct(today)

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <div className="min-w-[56rem]">
        <div className="flex border-b bg-muted/50 text-xs text-muted-foreground">
          <div className="w-64 shrink-0 px-4 py-2 font-medium">Activity</div>
          <div className="relative h-8 flex-1">
            {months.map((m) => (
              <span key={m.left} className="absolute top-2 -translate-x-1/2 whitespace-nowrap" style={{ left: `${m.left}%` }}>
                {m.label}
              </span>
            ))}
          </div>
        </div>
        <ul className="relative">
          {groupByPhase(activities).map((group) => (
            <li key={group.phase}>
              <div className="border-b bg-muted/30 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.phase}
              </div>
              <ul>
                {group.items.map((a) => {
                  const s = a.planned_start ?? a.planned_end
                  const e = a.planned_end ?? a.planned_start
                  const late = isOverdue(a, today)
                  const deps = predCount.get(a.id) ?? 0
                  return (
                    <li key={a.id} className="flex border-b last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className="flex w-64 shrink-0 items-center gap-1.5 truncate px-4 py-2 text-left text-sm text-foreground hover:bg-muted/50"
                      >
                        <span className="truncate">{a.name}</span>
                        {deps > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground" title={`${deps} predecessor(s)`}>
                            <Link2 className="size-3" aria-hidden="true" />
                            {deps}
                            <span className="sr-only">predecessors</span>
                          </span>
                        )}
                      </button>
                      <div className="relative h-10 flex-1">
                        {months.map((m) => (
                          <span key={m.left} aria-hidden="true" className="absolute inset-y-0 w-px bg-border" style={{ left: `${m.left}%` }} />
                        ))}
                        {s && e && a.activity_type === 'milestone' ? (
                          <button
                            type="button"
                            onClick={() => onSelect(a)}
                            aria-label={`${a.name}, ${formatDate(e)}`}
                            className={cn(
                              'absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]',
                              STATUS_BAR_TONE[a.status],
                              late && 'ring-2 ring-destructive ring-offset-1',
                            )}
                            style={{ left: `${pct(e)}%` }}
                          />
                        ) : s && e ? (
                          <button
                            type="button"
                            onClick={() => onSelect(a)}
                            aria-label={`${a.name}, ${formatDate(s)} to ${formatDate(e)}, ${Math.round(Number(a.percent_complete))}% complete`}
                            className={cn(
                              'absolute top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded bg-muted-foreground/20',
                              late && 'ring-2 ring-destructive',
                              conflictIds.has(a.id) && 'outline-2 outline-dashed outline-warning',
                            )}
                            style={{ left: `${pct(s)}%`, width: `max(0.5rem, ${pct(e) - pct(s) + (DAY / range.span) * 100}%)` }}
                          >
                            <span
                              className={cn('block h-full', STATUS_BAR_TONE[a.status])}
                              style={{ width: a.status === 'not_started' ? '100%' : `${Number(a.percent_complete)}%` }}
                            />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-destructive/70"
            style={{ left: `calc(16rem + (100% - 16rem) * ${todayLeft / 100})` }}
          />
        </ul>
        <div className="flex flex-wrap items-center gap-4 border-t px-4 py-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-primary" />Completed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-primary/60" />In progress</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded bg-destructive" />Delayed</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rotate-45 bg-muted-foreground/40" />Milestone</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-destructive/70" />Today</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded outline-2 outline-dashed outline-warning" />Dependency date conflict</span>
        </div>
      </div>
    </div>
  )
}

const KIND_TONE: Record<ScheduleActivity['activity_type'], string> = {
  task: 'bg-muted text-foreground',
  milestone: 'bg-primary/15 text-primary',
  inspection: 'bg-warning/15 text-warning-foreground',
  meeting: 'bg-accent text-accent-foreground',
}

export function ScheduleCalendar({ activities, onSelect }: ViewProps) {
  const today = todayIso()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const events = useMemo(() => {
    const map = new Map<string, { activity: ScheduleActivity; label: string }[]>()
    const add = (iso: string | null, activity: ScheduleActivity, label: string) => {
      if (!iso) return
      map.set(iso, [...(map.get(iso) ?? []), { activity, label }])
    }
    for (const a of activities) {
      if (a.status === 'skipped') continue
      if (a.activity_type === 'task') {
        add(a.planned_start, a, `Start: ${a.name}`)
      } else {
        add(a.planned_end ?? a.planned_start, a, a.name)
      }
    }
    return map
  }, [activities])

  const days = useMemo(() => {
    const first = new Date(month)
    first.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first)
      d.setDate(first.getDate() + i)
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { iso, day: d.getDate(), inMonth: d.getMonth() === month.getMonth() }
    })
  }, [month])

  const upcoming = activities
    .filter((a) => a.status !== 'completed' && a.status !== 'skipped' && a.activity_type !== 'task')
    .filter((a) => (a.planned_end ?? a.planned_start ?? '') >= today)
    .sort((x, y) => (x.planned_end ?? x.planned_start ?? '').localeCompare(y.planned_end ?? y.planned_start ?? ''))
    .slice(0, 8)

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1))

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_18rem]">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-serif text-lg font-semibold text-foreground" aria-live="polite">
            {month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button variant="outline" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="bg-muted/50 px-2 py-1.5 font-medium text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const items = events.get(d.iso) ?? []
            return (
              <div key={d.iso} className={cn('flex min-h-24 flex-col gap-1 bg-card p-1.5', !d.inMonth && 'bg-muted/30')}>
                <span
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full tabular-nums',
                    d.iso === today ? 'bg-primary font-semibold text-primary-foreground' : d.inMonth ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {d.day}
                </span>
                {items.slice(0, 3).map(({ activity, label }) => (
                  <button
                    key={activity.id + label}
                    type="button"
                    onClick={() => onSelect(activity)}
                    className={cn('truncate rounded px-1.5 py-0.5 text-left', KIND_TONE[activity.activity_type])}
                    title={label}
                  >
                    {label}
                  </button>
                ))}
                {items.length > 3 && <span className="px-1.5 text-muted-foreground">{`+${items.length - 3} more`}</span>}
              </div>
            )
          })}
        </div>
      </div>
      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h3 className="font-serif text-lg font-semibold text-foreground">Upcoming</h3>
        <p className="text-xs text-muted-foreground">Milestones, inspections, and meetings.</p>
        {upcoming.length ? (
          <ul className="flex flex-col divide-y">
            {upcoming.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onSelect(a)} className="flex w-full flex-col gap-0.5 py-2 text-left">
                  <span className="text-sm font-medium text-foreground">{a.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {`${ACTIVITY_TYPE_LABELS[a.activity_type]} · ${formatDate(a.planned_end ?? a.planned_start)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing scheduled ahead.</p>
        )}
      </aside>
    </div>
  )
}
