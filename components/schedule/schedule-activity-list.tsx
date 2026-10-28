'use client'

import { useMemo, useState } from 'react'
import { Diamond, Pencil, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ActivityStatusBadge, ProgressBar } from '@/components/schedule/schedule-badges'
import { ACTIVITY_STATUS_LABELS, isOverdue, type ActivityStatus, type ScheduleActivity } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { stageStyle } from '@/lib/schedule-stage-style'
import { cn } from '@/lib/utils'

type ListGroup = { project: { id: string; name: string }; activities: ScheduleActivity[] }

const ALL = 'all'

export function plannedRange(a: Pick<ScheduleActivity, 'planned_start' | 'planned_end'>) {
  if (!a.planned_start && !a.planned_end) return 'Not scheduled'
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end)
    return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  return formatDate(a.planned_end ?? a.planned_start)
}

export function actualRange(a: Pick<ScheduleActivity, 'actual_start' | 'actual_end'>) {
  if (!a.actual_start && !a.actual_end) return '—'
  if (a.actual_start && a.actual_end) return `${formatDate(a.actual_start)} – ${formatDate(a.actual_end)}`
  return a.actual_end ? `Finished ${formatDate(a.actual_end)}` : `Started ${formatDate(a.actual_start)}`
}

export function ScheduleActivityList({
  mode,
  groups,
  nameFor,
  onSelect,
  today,
  canManage,
}: {
  mode: 'project' | 'all'
  groups: ListGroup[]
  nameFor: (id: string | null) => string | null
  onSelect: (projectId: string) => (a: ScheduleActivity) => void
  today: string
  canManage: boolean
}) {
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState(ALL)
  const [status, setStatus] = useState(ALL)

  const { stages, statuses, total } = useMemo(() => {
    const stageSet: string[] = []
    const statusSet = new Set<ActivityStatus>()
    let count = 0
    for (const g of groups)
      for (const a of g.activities) {
        count++
        if (!stageSet.includes(a.phase)) stageSet.push(a.phase)
        statusSet.add(a.status)
      }
    const statusOrder = Object.keys(ACTIVITY_STATUS_LABELS) as ActivityStatus[]
    return { stages: stageSet, statuses: statusOrder.filter((s) => statusSet.has(s)), total: count }
  }, [groups])

  const needle = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          activities: g.activities.filter(
            (a) =>
              (stage === ALL || a.phase === stage) &&
              (status === ALL || a.status === status) &&
              (!needle || a.name.toLowerCase().includes(needle)),
          ),
        }))
        .filter((g) => g.activities.length > 0),
    [groups, stage, status, needle],
  )
  const shown = filtered.reduce((n, g) => n + g.activities.length, 0)
  const filtering = needle !== '' || stage !== ALL || status !== ALL
  const clear = () => {
    setQuery('')
    setStage(ALL)
    setStatus(ALL)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-[#E2E8E2] bg-white p-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search activities"
            aria-label="Search activities"
            className="h-9 pl-8"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger aria-label="Filter by stage" className="h-9 w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All stages</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: stageStyle(s).accent }} aria-hidden="true" />
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filter by status" className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {ACTIVITY_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-2 px-1 sm:ml-auto">
          <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {filtering ? `${shown} of ${total} activities` : `${total} activities`}
          </p>
          {filtering && (
            <Button variant="ghost" size="sm" className="h-8" onClick={clear}>
              <X data-icon="inline-start" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E2E8E2] bg-white px-4 py-10 text-center">
          <p className="text-sm font-medium text-foreground">No activities match these filters</p>
          <Button variant="outline" size="sm" onClick={clear}>
            Clear filters
          </Button>
        </div>
      ) : (
        filtered.map((g) => (
          <div key={g.project.id} className="flex flex-col gap-2">
            {mode === 'all' && (
              <h3 className="flex items-baseline gap-2 px-1 font-serif text-base font-semibold text-[#103B27]">
                {g.project.name}
                <span className="font-sans text-xs font-normal text-muted-foreground">{`${g.activities.length} activities`}</span>
              </h3>
            )}
            <ActivityTable activities={g.activities} nameFor={nameFor} onSelect={onSelect(g.project.id)} today={today} canManage={canManage} />
          </div>
        ))
      )}
    </div>
  )
}

function StageTag({ phase, className }: { phase: string; className?: string }) {
  const style = stageStyle(phase)
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-[#103B27]/80', className)}
      style={{ backgroundColor: style.background }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: style.accent }} aria-hidden="true" />
      <span className="truncate">{phase}</span>
    </span>
  )
}

function ActivityName({ activity, late }: { activity: ScheduleActivity; late: boolean }) {
  const accent = stageStyle(activity.phase).accent
  return (
    <span className="flex min-w-0 items-center gap-2">
      {activity.activity_type === 'milestone' && (
        <Diamond className="size-3.5 shrink-0" style={{ color: accent, fill: accent }} aria-label="Milestone" />
      )}
      <span className="truncate text-[0.9375rem] font-semibold text-[#103B27]">{activity.name}</span>
      {late && (
        <span className="shrink-0 rounded-full bg-[#FDE8E7] px-1.5 py-px text-[11px] font-medium text-[#BD302B]">Overdue</span>
      )}
    </span>
  )
}

function ActivityTable({
  activities,
  nameFor,
  onSelect,
  today,
  canManage,
}: {
  activities: ScheduleActivity[]
  nameFor: (id: string | null) => string | null
  onSelect: (a: ScheduleActivity) => void
  today: string
  canManage: boolean
}) {
  const actionLabel = canManage ? 'Edit' : 'View'
  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white">
      <table className="hidden w-full table-fixed text-sm md:table">
        <colgroup>
          <col />
          <col className="w-40" />
          <col className="hidden w-36 xl:table-column" />
          <col className="hidden w-48 lg:table-column" />
          <col className="hidden w-44 xl:table-column" />
          <col className="w-40" />
          <col className="w-32" />
          <col className="w-10" />
        </colgroup>
        <thead className="border-b border-[#E2E8E2] bg-[#F8F7F3] text-left text-[11px] font-semibold uppercase tracking-wider text-[#103B27]/60">
          <tr>
            <th scope="col" className="px-4 py-2.5">Activity</th>
            <th scope="col" className="px-3 py-2.5">Stage</th>
            <th scope="col" className="hidden px-3 py-2.5 xl:table-cell">Assigned</th>
            <th scope="col" className="hidden px-3 py-2.5 lg:table-cell">Planned</th>
            <th scope="col" className="hidden px-3 py-2.5 xl:table-cell">Actual</th>
            <th scope="col" className="px-3 py-2.5">Progress</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
            <th scope="col" className="px-2 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#EEF1EE]">
          {activities.map((a) => {
            const late = isOverdue(a, today)
            const assignee = nameFor(a.assigned_to)
            return (
              <tr
                key={a.id}
                onClick={() => onSelect(a)}
                className="group cursor-pointer transition-colors hover:bg-[#F8F7F3] focus-within:bg-[#F8F7F3] motion-reduce:transition-none"
              >
                <td className="px-4 py-2.5">
                  <ActivityName activity={a} late={late} />
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground xl:hidden">
                    {[assignee ?? 'Unassigned', plannedRange(a)].join(' · ')}
                    <span className="lg:hidden">{a.actual_start || a.actual_end ? ` · Actual ${actualRange(a)}` : ''}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <StageTag phase={a.phase} />
                </td>
                <td className={cn('hidden truncate px-3 py-2.5 xl:table-cell', assignee ? 'text-foreground/75' : 'italic text-muted-foreground')}>
                  {assignee ?? 'Unassigned'}
                </td>
                <td
                  className={cn(
                    'hidden truncate px-3 py-2.5 tabular-nums lg:table-cell',
                    !a.planned_start && !a.planned_end ? 'italic text-muted-foreground' : 'text-foreground/75',
                  )}
                >
                  {plannedRange(a)}
                </td>
                <td className="hidden truncate px-3 py-2.5 tabular-nums text-muted-foreground xl:table-cell">{actualRange(a)}</td>
                <td className="px-3 py-2.5">
                  <ProgressBar value={Number(a.percent_complete)} label={`${a.name} progress`} status={a.status} overdue={late} />
                </td>
                <td className="px-3 py-2.5">
                  <ActivityStatusBadge status={a.status} />
                </td>
                <td className="px-2 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect(a)
                    }}
                    aria-label={`${actionLabel} ${a.name}`}
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-40 transition-opacity hover:bg-white hover:text-[#174D32] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D32] group-hover:opacity-100 motion-reduce:transition-none"
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <ul className="divide-y divide-[#EEF1EE] md:hidden">
        {activities.map((a) => {
          const late = isOverdue(a, today)
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a)}
                aria-label={`${actionLabel} ${a.name}`}
                className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174D32] motion-reduce:transition-none"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col gap-1">
                    <ActivityName activity={a} late={late} />
                    <StageTag phase={a.phase} className="self-start" />
                  </span>
                  <ActivityStatusBadge status={a.status} />
                </span>
                <ProgressBar value={Number(a.percent_complete)} label={`${a.name} progress`} status={a.status} overdue={late} />
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <div className="flex min-w-0 flex-col">
                    <dt className="text-muted-foreground">Planned</dt>
                    <dd className="break-words text-foreground/80">{plannedRange(a)}</dd>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <dt className="text-muted-foreground">Actual</dt>
                    <dd className="break-words text-foreground/80">{actualRange(a)}</dd>
                  </div>
                  <div className="col-span-2 flex min-w-0 flex-col">
                    <dt className="text-muted-foreground">Assigned</dt>
                    <dd className="break-words text-foreground/80">{nameFor(a.assigned_to) ?? 'Unassigned'}</dd>
                  </div>
                </dl>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
