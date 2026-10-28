'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Diamond, Eye, Pencil, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActivityStatusBadge, ProgressBar } from '@/components/schedule/schedule-badges'
import { Flags, groupByPhase } from '@/components/schedule/schedule-views'
import { ACTIVITY_TYPE_LABELS, isOverdue, todayIso, type ScheduleActivity } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { stageStyle } from '@/lib/schedule-stage-style'

type StageListProps = {
  activities: ScheduleActivity[]
  conflictIds: Set<string>
  nameFor: (userId: string | null) => string | null
  onSelect: (activity: ScheduleActivity) => void
  canManage: boolean
}

function plannedLabel(a: ScheduleActivity) {
  if (!a.planned_start && !a.planned_end) return null
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end)
    return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  return formatDate(a.planned_end ?? a.planned_start)
}

function stageKey(index: number, phase: string) {
  return `${index}:${phase}`
}

export function ScheduleStageList({ activities, conflictIds, nameFor, onSelect, canManage }: StageListProps) {
  const today = todayIso()
  const stages = useMemo(
    () =>
      groupByPhase(activities).map((group, index) => {
        const counted = group.items.filter((a) => a.status !== 'skipped')
        const done = counted.filter((a) => a.status === 'completed').length
        return {
          ...group,
          key: stageKey(index, group.phase),
          number: index + 1,
          done,
          counted: counted.length,
          complete: counted.length > 0 && done === counted.length,
          underway: group.items.some((a) => a.status === 'in_progress' || a.status === 'delayed'),
        }
      }),
    [activities],
  )
  // Only a stage with work actually underway is labelled current; nothing is inferred for a schedule that has not started.
  const currentKey = stages.find((s) => s.underway)?.key ?? null

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(stages.filter((s) => s.complete).map((s) => s.key)))
  const allOpen = stages.every((s) => !collapsed.has(s.key))
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const actionLabel = canManage ? 'Edit' : 'View'
  const ActionIcon = canManage ? Pencil : Eye

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted-foreground">
          {`${stages.length} ${stages.length === 1 ? 'stage' : 'stages'} · ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(allOpen ? new Set(stages.map((s) => s.key)) : new Set())}
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-[#174D32] transition-colors hover:bg-[#EAF0E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D32] sm:min-h-8"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <ol className="flex flex-col gap-3">
        {stages.map((stage) => {
          const open = !collapsed.has(stage.key)
          const style = stageStyle(stage.phase)
          const StageIcon = style.icon
          const isCurrent = stage.key === currentKey
          const panelId = `stage-panel-${stage.number}`
          return (
            <li
              key={stage.key}
              className={cn(
                'overflow-hidden rounded-xl border bg-white transition-shadow',
                isCurrent ? 'border-[#174D32]/35 shadow-[0_1px_0_0_#174D32_inset,0_4px_14px_-10px_rgb(16_59_39/0.45)]' : 'border-[#E2E8E2]',
              )}
            >
              <h3>
                <button
                  type="button"
                  onClick={() => toggle(stage.key)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#174D32] sm:px-5"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: style.background, color: style.accent }}
                    aria-hidden="true"
                  >
                    <StageIcon className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-mono text-xs font-medium tabular-nums text-[#103B27]/50">
                        {String(stage.number).padStart(2, '0')}
                      </span>
                      <span className="font-serif text-base font-semibold text-[#103B27]">{stage.phase}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-[#174D32] px-2 py-0.5 text-[11px] font-medium text-white">Current stage</span>
                      )}
                      {stage.complete && (
                        <span className="rounded-full bg-[#E2F3E9] px-2 py-0.5 text-[11px] font-medium text-[#187542]">Complete</span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {stage.counted > 0
                        ? `${stage.done} of ${stage.counted} complete`
                        : 'All activities skipped'}
                      {stage.items.length !== stage.counted && stage.counted > 0
                        ? ` · ${stage.items.length - stage.counted} skipped`
                        : ''}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn('size-4 shrink-0 text-[#103B27]/60 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              </h3>

              {open && (
                <ul id={panelId} className="divide-y divide-[#EEF1EE] border-t border-[#EEF1EE]">
                  {stage.items.map((a) => {
                    const late = isOverdue(a, today)
                    const milestone = a.activity_type === 'milestone'
                    const assignee = nameFor(a.assigned_to)
                    const planned = plannedLabel(a)
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-5',
                          'md:grid-cols-[minmax(0,1fr)_9rem_11rem_8.5rem_auto]',
                          milestone && 'bg-[#F8F7F3]',
                        )}
                      >
                        <div className="flex min-w-0 flex-col gap-1">
                          <button
                            type="button"
                            onClick={() => onSelect(a)}
                            className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D32]"
                          >
                            {milestone && (
                              <Diamond className="size-3.5 shrink-0" style={{ color: style.accent, fill: style.accent }} aria-label="Milestone" />
                            )}
                            <span className={cn('truncate text-sm text-[#103B27] hover:underline', milestone ? 'font-semibold' : 'font-medium')}>
                              {a.name}
                            </span>
                            {!a.is_published && <span className="shrink-0 text-xs text-muted-foreground">Internal</span>}
                          </button>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            {a.activity_type !== 'task' && <span>{ACTIVITY_TYPE_LABELS[a.activity_type]}</span>}
                            <span className="md:hidden">{planned ?? 'Not scheduled'}</span>
                            <span className="md:hidden">{assignee ?? 'Unassigned'}</span>
                            {a.actual_end && <span>{`Finished ${formatDate(a.actual_end)}`}</span>}
                            {!a.actual_end && a.actual_start && <span>{`Started ${formatDate(a.actual_start)}`}</span>}
                          </span>
                          <Flags activity={a} conflict={conflictIds.has(a.id)} today={today} />
                        </div>

                        <span
                          className={cn(
                            'hidden min-w-0 items-center gap-1.5 truncate text-sm md:flex',
                            assignee ? 'text-foreground/80' : 'italic text-muted-foreground',
                          )}
                        >
                          <UserRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="truncate">{assignee ?? 'Unassigned'}</span>
                        </span>
                        <span className={cn('hidden truncate text-sm tabular-nums md:block', planned ? 'text-foreground/80' : 'italic text-muted-foreground')}>
                          {planned ?? 'Not scheduled'}
                        </span>

                        <div className="col-span-2 flex items-center gap-3 md:col-span-1 md:flex-col md:items-stretch md:gap-1.5">
                          <ProgressBar
                            value={Number(a.percent_complete)}
                            label={`${a.name} progress`}
                            status={a.status}
                            overdue={late}
                            className="flex-1"
                          />
                          <ActivityStatusBadge status={a.status} className="md:self-start" />
                        </div>

                        <button
                          type="button"
                          onClick={() => onSelect(a)}
                          aria-label={`${actionLabel} ${a.name}`}
                          className="row-start-1 col-start-2 inline-flex size-11 items-center justify-center gap-1.5 self-start rounded-lg border border-[#E2E8E2] bg-white text-sm font-medium text-[#174D32] transition-colors hover:border-[#174D32] hover:bg-[#EAF0E9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D32] md:col-start-auto md:row-start-auto md:h-9 md:w-auto md:self-center md:px-3"
                        >
                          <ActionIcon className="size-4" aria-hidden="true" />
                          <span className="hidden md:inline">{actionLabel}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
