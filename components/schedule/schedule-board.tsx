'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Diamond, GanttChart, Layers, List, Pencil } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ScheduleTimeline } from '@/components/schedule/schedule-views'
import { PortfolioTimeline } from '@/components/schedule/portfolio-timeline'
import { ScheduleActivityList, plannedRange } from '@/components/schedule/schedule-activity-list'
import { ActivityStatusBadge, ProgressBar } from '@/components/schedule/schedule-badges'
import { isOverdue, todayIso, type ScheduleActivity, type ScheduleDependency, type SchedulePhase } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { stageStyle } from '@/lib/schedule-stage-style'
import { cn } from '@/lib/utils'
import { segmentClass } from '@/lib/interaction-styles'

export type BoardGroup = {
  project: { id: string; name: string; statusLabel: string }
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  phases: SchedulePhase[]
}

type View = 'stages' | 'timeline' | 'list'

const VIEWS: { value: View; label: string; icon: typeof Layers }[] = [
  { value: 'stages', label: 'Stages', icon: Layers },
  { value: 'timeline', label: 'Gantt', icon: GanttChart },
  { value: 'list', label: 'List', icon: List },
]

function groupByPhase(activities: ScheduleActivity[]) {
  const order: string[] = []
  const map = new Map<string, ScheduleActivity[]>()
  for (const a of activities) {
    if (!map.has(a.phase)) {
      map.set(a.phase, [])
      order.push(a.phase)
    }
    map.get(a.phase)!.push(a)
  }
  return order.map((phase) => ({ phase, items: map.get(phase)! }))
}

function isFinished(a: ScheduleActivity) {
  return a.status === 'completed' || a.status === 'skipped'
}

// The phase with active work is the current phase; otherwise the first phase with unfinished work.
// Returns null when nothing is unfinished, leaving the existing defaults in place.
function currentPhase(phases: { phase: string; items: ScheduleActivity[] }[]) {
  const active = phases.find(({ items }) =>
    items.some((a) => a.status === 'in_progress' || a.status === 'delayed' || a.status === 'on_hold'),
  )
  if (active) return active.phase
  return phases.find(({ items }) => items.some((a) => !isFinished(a)))?.phase ?? null
}

function phaseDates(items: ScheduleActivity[]) {
  const starts = items.map((a) => a.planned_start ?? a.planned_end).filter(Boolean) as string[]
  const ends = items.map((a) => a.planned_end ?? a.planned_start).filter(Boolean) as string[]
  if (!starts.length) return 'Not scheduled'
  const s = starts.sort()[0]
  const e = ends.sort()[ends.length - 1]
  return s === e ? formatDate(s) : `${formatDate(s)} – ${formatDate(e)}`
}

export function ScheduleBoard({
  mode,
  groups,
  staffOptions,
  conflictIds,
  canManage,
}: {
  mode: 'project' | 'all'
  groups: BoardGroup[]
  staffOptions: { value: string; label: string }[]
  conflictIds: string[]
  canManage: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<View>('stages')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const g of groups) {
      if (mode === 'all') initial.add(`p:${g.project.id}`)
      const phases = groupByPhase(g.activities)
      const current = mode === 'project' ? currentPhase(phases) : null
      for (const { phase, items } of phases) {
        const done = items.every(isFinished)
        if (mode === 'all' || done || (current !== null && phase !== current)) initial.add(`${g.project.id}:${phase}`)
      }
    }
    return initial
  })

  const conflicts = useMemo(() => new Set(conflictIds), [conflictIds])
  const names = useMemo(() => new Map(staffOptions.map((s) => [s.value, s.label])), [staffOptions])
  const nameFor = useCallback((id: string | null) => (id ? (names.get(id) ?? 'Former team member') : null), [names])
  const today = todayIso()

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const allKeys = useMemo(
    () =>
      groups.flatMap((g) => [
        ...(mode === 'all' ? [`p:${g.project.id}`] : []),
        ...groupByPhase(g.activities).map(({ phase }) => `${g.project.id}:${phase}`),
      ]),
    [groups, mode],
  )
  const allCollapsed = allKeys.every((k) => collapsed.has(k))
  const noneCollapsed = allKeys.every((k) => !collapsed.has(k))

  // Editing lives in the project schedule workspace, which opens the activity from ?activity=.
  const open = (projectId: string) => (a: ScheduleActivity) =>
    router.push(`/projects/${projectId}/schedule?activity=${encodeURIComponent(a.id)}`)
  const manageHref = mode === 'project' && groups[0] ? `/projects/${groups[0].project.id}/schedule` : null

  const totalActivities = groups.reduce((n, g) => n + g.activities.length, 0)

  return (
    <section aria-label="Schedule activities" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-xl border border-[#D6DDE5] bg-white p-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Schedule view" className="inline-flex w-full rounded-lg border border-[#D6DDE5] bg-[#E9EDF2] p-1 sm:w-auto">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => setView(v.value)}
              className={cn(
                'flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium sm:flex-none',
                segmentClass(view === v.value),
                view === v.value && 'shadow-sm',
              )}
            >
              <v.icon className="size-4" aria-hidden="true" />
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 px-1 sm:px-0">
          {view === 'stages' && totalActivities > 0 && (
            <>
              <Button variant="ghost" size="sm" className="min-h-10 text-primary hover:bg-[#E9EDF2] hover:text-primary" disabled={noneCollapsed} onClick={() => setCollapsed(new Set())}>
                <ChevronsUpDown data-icon="inline-start" />
                Expand all
              </Button>
              <Button variant="ghost" size="sm" className="min-h-10 text-primary hover:bg-[#E9EDF2] hover:text-primary" disabled={allCollapsed} onClick={() => setCollapsed(new Set(allKeys))}>
                <ChevronsDownUp data-icon="inline-start" />
                Collapse all
              </Button>
            </>
          )}
          {manageHref && (
            <Link
              href={manageHref}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'min-h-10 text-[#006B78] hover:bg-[#E9EDF2] hover:text-[#006B78]')}
            >
              <Pencil data-icon="inline-start" />
              {canManage ? 'Manage schedule' : 'Open project schedule'}
            </Link>
          )}
        </div>
      </div>

      {view === 'stages' && (
        <div className="flex flex-col gap-3">
          {groups.map((g) =>
            mode === 'all' ? (
              <ProjectSection
                key={g.project.id}
                group={g}
                open={!collapsed.has(`p:${g.project.id}`)}
                onToggle={() => toggle(`p:${g.project.id}`)}
              >
                <StageList group={g} collapsed={collapsed} toggle={toggle} nameFor={nameFor} onSelect={open(g.project.id)} today={today} />
              </ProjectSection>
            ) : (
              <StageList key={g.project.id} group={g} collapsed={collapsed} toggle={toggle} nameFor={nameFor} onSelect={open(g.project.id)} today={today} />
            ),
          )}
        </div>
      )}

      {view === 'timeline' &&
        (mode === 'project' && groups[0] ? (
          <ScheduleTimeline
            activities={groups[0].activities}
            dependencies={groups[0].dependencies}
            conflictIds={conflicts}
            nameFor={nameFor}
            onSelect={open(groups[0].project.id)}
          />
        ) : (
          <div className="rounded-xl border border-[#D6DDE5] bg-white p-4 sm:p-5">
            <PortfolioTimeline rows={groups.map((g) => ({ id: g.project.id, name: g.project.name, activities: g.activities }))} />
          </div>
        ))}

      {view === 'list' && (
        <ScheduleActivityList mode={mode} groups={groups} nameFor={nameFor} onSelect={open} today={today} canManage={canManage} />
      )}
    </section>
  )
}

function ProjectSection({
  group,
  open,
  onToggle,
  children,
}: {
  group: BoardGroup
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const done = group.activities.filter((a) => a.status === 'completed').length
  const inProgress = group.activities.filter((a) => a.status === 'in_progress').length
  const overdue = group.activities.filter((a) => isOverdue(a)).length
  const panelId = `project-${group.project.id}`
  return (
    <div className="overflow-hidden rounded-xl border border-[#D6DDE5] bg-white">
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F7F9FB] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <ChevronDown className={cn('size-4 shrink-0 text-[#526173] transition-transform motion-reduce:transition-none', !open && '-rotate-90')} aria-hidden="true" />
          <span className="flex min-w-0 flex-col">
            <span className="font-serif text-base font-semibold text-[#17212B]">{group.project.name}</span>
            <span className="text-xs text-[#526173]">
              {[
                group.project.statusLabel,
                `${done} of ${group.activities.length} complete`,
                inProgress ? `${inProgress} in progress` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          {overdue > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {`${overdue} overdue`}
            </span>
          )}
        </button>
        <Link
          href={`/projects/${group.project.id}/schedule`}
          className="hidden shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[#006B78] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006B78] sm:inline"
        >
          Manage schedule
        </Link>
      </div>
      {open && (
        <div id={panelId} className="border-t border-[#D6DDE5] bg-[#F3F4F6] p-2 sm:p-3">
          {children}
        </div>
      )}
    </div>
  )
}

function StageList({
  group,
  collapsed,
  toggle,
  nameFor,
  onSelect,
  today,
}: {
  group: BoardGroup
  collapsed: Set<string>
  toggle: (key: string) => void
  nameFor: (id: string | null) => string | null
  onSelect: (a: ScheduleActivity) => void
  today: string
}) {
  return (
    <div className="flex flex-col gap-2">
      {groupByPhase(group.activities).map(({ phase, items }, index) => {
        const key = `${group.project.id}:${phase}`
        const open = !collapsed.has(key)
        const done = items.filter(isFinished).length
        const overdue = items.filter((a) => isOverdue(a, today)).length
        const complete = done === items.length
        const style = stageStyle(phase)
        const StageIcon = style.icon
        const panelId = `stage-${key.replace(/[^a-z0-9]/gi, '-')}`
        return (
          <div
            key={key}
            className="overflow-hidden rounded-lg border border-[#D6DDE5] border-l-[3px] bg-white"
            style={{ borderLeftColor: style.accent }}
          >
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(key)}
              className="flex min-h-12 w-full items-center gap-3 bg-[#E9EDF2] px-3 py-2.5 text-left text-[#17212B] transition-colors hover:bg-[#E1E6EC] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-4"
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                  complete ? 'text-white' : 'bg-white',
                )}
                style={
                  complete
                    ? { backgroundColor: style.accent, borderColor: style.accent }
                    : { borderColor: `${style.accent}55`, color: style.accent }
                }
              >
                <span className="sr-only">{'Stage '}</span>
                {index + 1}
              </span>
              <StageIcon className="size-4 shrink-0" style={{ color: style.accent }} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="text-sm font-semibold text-[#17212B]">{phase}</span>
                <span className="text-xs text-[#526173]">{phaseDates(items)}</span>
              </span>
              {overdue > 0 && (
                <span className="hidden shrink-0 rounded-full border border-[#F5C7C5] bg-[#FDE8E7] px-2 py-0.5 text-xs font-medium text-[#BD302B] sm:inline">
                  {`${overdue} overdue`}
                </span>
              )}
              <span className="flex shrink-0 items-center gap-2">
                <span className="hidden h-1 w-12 overflow-hidden rounded-full bg-white ring-1 ring-[#D6DDE5] sm:block" aria-hidden="true">
                  {done > 0 && (
                    <span className="block h-full rounded-full" style={{ width: `${(done / items.length) * 100}%`, backgroundColor: style.accent }} />
                  )}
                </span>
                <span className="text-xs font-medium tabular-nums text-[#17212B]">
                  {`${done}/${items.length}`}
                  <span className="sr-only">{' activities complete'}</span>
                </span>
              </span>
              <ChevronDown
                className={cn('size-4 shrink-0 text-[#526173] transition-transform motion-reduce:transition-none', !open && '-rotate-90')}
                aria-hidden="true"
              />
            </button>
            {open && (
              <div
                aria-hidden="true"
                className="hidden border-t border-[#D6DDE5] bg-[#F5F7F9] px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#526173] md:grid md:grid-cols-[minmax(0,1fr)_9rem_11rem_8rem_7.5rem] md:gap-4"
              >
                <span>Activity</span>
                <span>Assigned</span>
                <span>Planned</span>
                <span>Progress</span>
                <span className="justify-self-end">Status</span>
              </div>
            )}
            {open && (
              <ul id={panelId} className="divide-y divide-[#E4E9EF] border-t border-[#D6DDE5] bg-white">
                {items.map((a) => {
                  const late = isOverdue(a, today)
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className="group grid w-full gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[#F7F9FB] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary md:grid-cols-[minmax(0,1fr)_9rem_11rem_8rem_7.5rem] md:items-center md:gap-4"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#006B78]">
                          {a.activity_type === 'milestone' ? (
                            <Diamond className="size-3.5 shrink-0" style={{ color: style.accent, fill: style.accent }} aria-label="Milestone" />
                          ) : (
                            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: style.accent }} aria-hidden="true" />
                          )}
                          <span className="min-w-0 break-words underline-offset-2 group-hover:underline">{a.name}</span>
                          {late && (
                            <span className="shrink-0 rounded-full bg-[#FDE8E7] px-1.5 py-px text-[11px] font-medium text-[#BD302B]">Overdue</span>
                          )}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#526173] md:contents">
                          <span className={cn('truncate md:text-sm', a.assigned_to ? 'text-[#17212B]' : 'italic text-[#526173]')}>
                            {nameFor(a.assigned_to) ?? 'Unassigned'}
                          </span>
                          <span className={cn('tabular-nums md:text-sm', !a.planned_start && !a.planned_end ? 'italic text-[#526173]' : 'text-[#17212B]')}>
                            {plannedRange(a)}
                          </span>
                        </span>
                        <ProgressBar value={Number(a.percent_complete)} label={`${a.name} progress`} status={a.status} overdue={late} />
                        <span className="md:justify-self-end">
                          <ActivityStatusBadge status={a.status} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
