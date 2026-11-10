'use client'

import { useMemo, useState } from 'react'
import { ScheduleBoard, type BoardGroup } from '@/components/schedule/schedule-board'
import { SCHEDULE_FILTERS, UPCOMING_DAYS, type ScheduleFilter } from '@/lib/schedule-filters'
import { cn } from '@/lib/utils'

const LABELS: Record<ScheduleFilter, string> = {
  all: 'All',
  unscheduled: 'Unscheduled',
  in_progress: 'In progress',
  overdue: 'Overdue',
  upcoming: `Upcoming · Next ${UPCOMING_DAYS} days`,
}

const EMPTY: Record<Exclude<ScheduleFilter, 'all'>, string> = {
  unscheduled: 'Every activity has planned dates.',
  in_progress: 'No activities are in progress.',
  overdue: 'Nothing is past its planned finish.',
  upcoming: `Nothing starts or is due in the next ${UPCOMING_DAYS} days.`,
}

export function FilteredScheduleBoard({
  mode,
  groups,
  flags,
  staffOptions,
  conflictIds,
  canManage,
}: {
  mode: 'project' | 'all'
  groups: BoardGroup[]
  /** Filters each activity matches, computed on the server from the full scoped dataset. */
  flags: Record<string, ScheduleFilter[]>
  staffOptions: { value: string; label: string }[]
  conflictIds: string[]
  canManage: boolean
}) {
  const [filter, setFilter] = useState<ScheduleFilter>('all')

  const counts = useMemo(() => {
    const c = Object.fromEntries(SCHEDULE_FILTERS.map((f) => [f, 0])) as Record<ScheduleFilter, number>
    for (const g of groups) for (const a of g.activities) for (const f of flags[a.id] ?? ['all']) c[f] += 1
    return c
  }, [groups, flags])

  const visible = useMemo(() => {
    if (filter === 'all') return groups
    return groups
      .map((g) => {
        const activities = g.activities.filter((a) => flags[a.id]?.includes(filter))
        const ids = new Set(activities.map((a) => a.id))
        return {
          ...g,
          activities,
          dependencies: g.dependencies.filter((d) => ids.has(d.predecessor_id) && ids.has(d.successor_id)),
        }
      })
      .filter((g) => g.activities.length > 0)
  }, [groups, flags, filter])

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Filter activities" className="flex flex-wrap gap-2">
        {SCHEDULE_FILTERS.map((f) => {
          const active = filter === f
          const alert = f === 'overdue' && counts.overdue > 0
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-control border px-3.5 text-sm font-medium transition-colors sm:min-h-9',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {LABELS[f]}
              <span
                className={cn(
                  'rounded-badge px-1.5 text-xs font-semibold tabular-nums',
                  alert ? 'bg-[#FDE8E7] text-[#BD302B]' : active ? 'bg-primary/15 text-foreground' : 'bg-muted text-foreground',
                )}
              >
                {counts[f]}
              </span>
            </button>
          )
        })}
      </div>

      <ScheduleBoard
        mode={mode}
        groups={visible}
        staffOptions={staffOptions}
        conflictIds={conflictIds}
        canManage={canManage}
        filterKey={filter}
        emptyState={
          filter !== 'all' && (
            <div role="status" className="flex flex-col items-start gap-2 rounded-xl border border-dashed bg-card px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{`No ${LABELS[filter].split(' · ')[0].toLowerCase()} activities. `}</span>
                {EMPTY[filter]}
              </p>
              <button
                type="button"
                onClick={() => setFilter('all')}
                className="min-h-11 rounded-md px-2 text-sm font-medium text-[#006B78] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-9"
              >
                Show all activities
              </button>
            </div>
          )
        }
      />
    </div>
  )
}
