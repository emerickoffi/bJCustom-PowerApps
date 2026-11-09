'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ScheduleGantt, type ScheduleGanttProps } from '@/components/schedule/schedule-gantt'
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
        <span className="inline-flex items-center gap-1 rounded-badge bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlertTriangle className="size-3" aria-hidden="true" />
          Past due
        </span>
      )}
      {conflict && (
        <span className="inline-flex items-center gap-1 rounded-badge bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-foreground">
          <Link2 className="size-3" aria-hidden="true" />
          Date conflict
        </span>
      )}
    </span>
  )
}

/** The schedule's date view. Kept under its original name so existing callers get the Gantt. */
export function ScheduleTimeline(props: ViewProps & Omit<ScheduleGanttProps, keyof ViewProps>) {
  return <ScheduleGantt {...props} />
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
