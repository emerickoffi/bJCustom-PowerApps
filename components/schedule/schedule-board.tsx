'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Diamond, GanttChart, Layers, List, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ActivityEditor } from '@/components/schedule/activity-editor'
import { ScheduleTimeline } from '@/components/schedule/schedule-views'
import { PortfolioTimeline } from '@/components/schedule/portfolio-timeline'
import { ActivityStatusBadge, ProgressBar } from '@/components/schedule/schedule-badges'
import { isOverdue, todayIso, type ScheduleActivity, type ScheduleDependency } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export type BoardGroup = {
  project: { id: string; name: string; statusLabel: string }
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
}

type View = 'stages' | 'timeline' | 'list'

const VIEWS: { value: View; label: string; icon: typeof Layers }[] = [
  { value: 'stages', label: 'Stages', icon: Layers },
  { value: 'timeline', label: 'Timeline', icon: GanttChart },
  { value: 'list', label: 'List', icon: List },
]

function plannedRange(a: Pick<ScheduleActivity, 'planned_start' | 'planned_end'>) {
  if (!a.planned_start && !a.planned_end) return 'Not scheduled'
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end)
    return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  return formatDate(a.planned_end ?? a.planned_start)
}

function actualRange(a: Pick<ScheduleActivity, 'actual_start' | 'actual_end'>) {
  if (!a.actual_start && !a.actual_end) return '—'
  if (a.actual_start && a.actual_end) return `${formatDate(a.actual_start)} – ${formatDate(a.actual_end)}`
  return a.actual_end ? `Finished ${formatDate(a.actual_end)}` : `Started ${formatDate(a.actual_start)}`
}

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
  const [view, setView] = useState<View>('stages')
  const [selected, setSelected] = useState<{ projectId: string; id: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const g of groups) {
      if (mode === 'all') initial.add(`p:${g.project.id}`)
      for (const { phase, items } of groupByPhase(g.activities)) {
        const done = items.every((a) => a.status === 'completed' || a.status === 'skipped')
        if (done || mode === 'all') initial.add(`${g.project.id}:${phase}`)
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

  const editingGroup = selected ? groups.find((g) => g.project.id === selected.projectId) : undefined
  const editingActivity = editingGroup?.activities.find((a) => a.id === selected?.id) ?? null
  const open = (projectId: string) => (a: ScheduleActivity) => setSelected({ projectId, id: a.id })

  const totalActivities = groups.reduce((n, g) => n + g.activities.length, 0)

  return (
    <section aria-label="Schedule activities" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Schedule view" className="inline-flex w-full rounded-lg border border-border bg-muted/60 p-1 sm:w-auto">
          {VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => setView(v.value)}
              className={cn(
                'flex min-h-10 flex-1 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none',
                view === v.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <v.icon className="size-4" aria-hidden="true" />
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'stages' && totalActivities > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10"
              onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(allKeys))}
            >
              {allCollapsed ? <ChevronsUpDown data-icon="inline-start" /> : <ChevronsDownUp data-icon="inline-start" />}
              {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          )}
          {totalActivities > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Pencil className="size-3.5" aria-hidden="true" />
              {canManage ? 'Select an activity to edit it' : 'Select an activity to view details'}
            </span>
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
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <PortfolioTimeline rows={groups.map((g) => ({ id: g.project.id, name: g.project.name, activities: g.activities }))} />
          </div>
        ))}

      {view === 'list' && (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.project.id} className="flex flex-col gap-2">
              {mode === 'all' && (
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {g.project.name}
                  <span className="text-xs font-normal text-muted-foreground">{`${g.activities.length} activities`}</span>
                </h3>
              )}
              <ActivityTable activities={g.activities} nameFor={nameFor} onSelect={open(g.project.id)} today={today} />
            </div>
          ))}
        </div>
      )}

      {editingGroup && (
        <ActivityEditor
          projectId={editingGroup.project.id}
          activity={editingActivity}
          activities={editingGroup.activities}
          dependencies={editingGroup.dependencies}
          staffOptions={staffOptions}
          canManage={canManage}
          onClose={() => setSelected(null)}
        />
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
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden="true" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-serif text-base font-semibold text-foreground">{group.project.name}</span>
            <span className="text-xs text-muted-foreground">
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
          className="hidden shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline sm:inline"
        >
          Open tracker
        </Link>
      </div>
      {open && (
        <div id={panelId} className="border-t border-border bg-background/40 p-3">
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
        const done = items.filter((a) => a.status === 'completed' || a.status === 'skipped').length
        const overdue = items.filter((a) => isOverdue(a, today)).length
        const active = items.some((a) => a.status === 'in_progress')
        const panelId = `stage-${key.replace(/[^a-z0-9]/gi, '-')}`
        return (
          <div key={key} className="overflow-hidden rounded-lg border border-border border-l-[3px] border-l-[#174D32] bg-card">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => toggle(key)}
              className="flex min-h-12 w-full items-center gap-3 bg-[#F8F7F3] px-4 py-2.5 text-left transition-colors hover:bg-[#F1EFE8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174D32]"
            >
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                  done === items.length
                    ? 'border-[#174D32] bg-[#174D32] text-white'
                    : active
                      ? 'border-[#174D32]/30 bg-white text-[#174D32]'
                      : 'border-[#D8E0E8] bg-white text-[#526174]',
                )}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <span className="truncate text-sm font-semibold text-foreground">{phase}</span>
                <span className="text-xs text-muted-foreground">{phaseDates(items)}</span>
              </span>
              {overdue > 0 && (
                <span className="hidden shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive sm:inline">
                  {`${overdue} overdue`}
                </span>
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{`${done}/${items.length}`}</span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} aria-hidden="true" />
            </button>
            {open && (
              <ul id={panelId} className="divide-y divide-border/70 border-t border-border bg-card">
                {items.map((a) => {
                  const late = isOverdue(a, today)
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(a)}
                        className={cn(
                          'grid w-full gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174D32] md:grid-cols-[minmax(0,1fr)_9rem_11rem_8rem_7.5rem] md:items-center md:gap-4',
                          late && 'bg-[#FDE8E7]/40 hover:bg-[#FDE8E7]/70',
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                          {a.activity_type === 'milestone' && <Diamond className="size-3.5 shrink-0 fill-primary text-primary" aria-label="Milestone" />}
                          <span className="truncate">{a.name}</span>
                          {late && <span className="shrink-0 text-xs font-medium text-destructive">Overdue</span>}
                        </span>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:contents">
                          <span className={cn('truncate md:text-sm', a.assigned_to ? 'text-foreground/80' : 'text-muted-foreground')}>
                            {nameFor(a.assigned_to) ?? 'Unassigned'}
                          </span>
                          <span className={cn('tabular-nums text-foreground/80 md:text-sm', !a.planned_start && !a.planned_end && 'italic text-muted-foreground')}>
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

function ActivityTable({
  activities,
  nameFor,
  onSelect,
  today,
}: {
  activities: ScheduleActivity[]
  nameFor: (id: string | null) => string | null
  onSelect: (a: ScheduleActivity) => void
  today: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <table className="hidden w-full text-sm lg:table">
        <thead className="border-b border-border bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">Activity</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Stage</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Assigned</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Planned</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Actual</th>
            <th scope="col" className="w-36 px-4 py-2.5 font-medium">Progress</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {activities.map((a) => {
            const late = isOverdue(a, today)
            return (
              <tr key={a.id} className={cn('transition-colors hover:bg-[#F8F7F3]', late && 'bg-[#FDE8E7]/40 hover:bg-[#FDE8E7]/70')}>
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => onSelect(a)}
                    className="flex items-center gap-1.5 rounded text-left font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {a.activity_type === 'milestone' && <Diamond className="size-3.5 shrink-0 fill-primary text-primary" aria-label="Milestone" />}
                    {a.name}
                  </button>
                  {late && <span className="text-xs font-medium text-destructive">Overdue</span>}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.phase}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{nameFor(a.assigned_to) ?? 'Unassigned'}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{plannedRange(a)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{actualRange(a)}</td>
                <td className="px-4 py-2.5">
                  <ProgressBar value={Number(a.percent_complete)} label={`${a.name} progress`} status={a.status} overdue={late} />
                </td>
                <td className="px-4 py-2.5">
                  <ActivityStatusBadge status={a.status} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <ul className="divide-y divide-border lg:hidden">
        {activities.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onSelect(a)}
              className={cn(
                'flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174D32]',
                isOverdue(a, today) && 'bg-[#FDE8E7]/40',
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-foreground">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.phase}</span>
                </span>
                <ActivityStatusBadge status={a.status} />
              </span>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">Planned</dt>
                  <dd className="text-foreground">{plannedRange(a)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">Actual</dt>
                  <dd className="text-foreground">{actualRange(a)}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">Assigned</dt>
                  <dd className="text-foreground">{nameFor(a.assigned_to) ?? 'Unassigned'}</dd>
                </div>
                <div className="flex flex-col">
                  <dt className="text-muted-foreground">Progress</dt>
                  <dd className="text-foreground tabular-nums">{`${Math.round(Number(a.percent_complete))}%`}</dd>
                </div>
              </dl>
              {isOverdue(a, today) && <span className="text-xs font-medium text-destructive">Overdue</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
