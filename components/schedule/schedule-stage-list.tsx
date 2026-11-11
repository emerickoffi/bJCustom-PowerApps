'use client'

import { useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, ChevronDown, Diamond, Eye, FolderInput, GripVertical, MoreHorizontal, Pencil, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActivityStatusBadge, ProgressBar } from '@/components/schedule/schedule-badges'
import { Flags } from '@/components/schedule/schedule-views'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ACTIVITY_TYPE_LABELS, isOverdue, todayIso, type ScheduleActivity, type SchedulePhase } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { stageStyle } from '@/lib/schedule-stage-style'
import { renamePhaseAction, reorderScheduleAction } from '@/app/actions/schedule'

type StageListProps = {
  projectId: string
  phases: SchedulePhase[]
  activities: ScheduleActivity[]
  conflictIds: Set<string>
  nameFor: (userId: string | null) => string | null
  onSelect: (activity: ScheduleActivity) => void
  canManage: boolean
}

/** The List view's manual order: phases top to bottom, and each phase's activity IDs top to bottom. */
type Order = { phases: { id: string; name: string }[]; items: Record<string, string[]> }

const PHASE = 'phase:'
const ACT = 'act:'
const MAX_PHASE_NAME = 80

function buildOrder(phases: SchedulePhase[], activities: ScheduleActivity[]): Order {
  const list = phases.map((p) => ({ id: p.id, name: p.name }))
  const items: Record<string, string[]> = Object.fromEntries(list.map((p) => [p.id, [] as string[]]))
  for (const a of activities) {
    if (!items[a.phase_id]) {
      list.push({ id: a.phase_id, name: a.phase })
      items[a.phase_id] = []
    }
    items[a.phase_id].push(a.id)
  }
  return { phases: list, items }
}

function orderKey(o: Order) {
  return o.phases.map((p) => `${p.id}=${p.name}:${o.items[p.id].join(',')}`).join('|')
}

function phaseOf(o: Order, activityId: string) {
  return o.phases.find((p) => o.items[p.id].includes(activityId))?.id ?? null
}

function moveActivity(o: Order, activityId: string, toPhase: string, toIndex: number): Order {
  const from = phaseOf(o, activityId)
  if (!from) return o
  const items = { ...o.items, [from]: o.items[from].filter((id) => id !== activityId) }
  const target = [...items[toPhase]]
  target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, activityId)
  items[toPhase] = target
  return { ...o, items }
}

function plannedLabel(a: ScheduleActivity) {
  if (!a.planned_start && !a.planned_end) return null
  if (a.planned_start && a.planned_end && a.planned_start !== a.planned_end)
    return `${formatDate(a.planned_start)} – ${formatDate(a.planned_end)}`
  return formatDate(a.planned_end ?? a.planned_start)
}

const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-brand-deep/70 transition-colors hover:bg-interactive-soft hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-40'
const handleClass =
  'flex w-8 shrink-0 cursor-grab touch-none select-none items-center justify-center text-brand-deep/45 transition-colors hover:bg-[#F1F0EA] hover:text-brand-deep active:cursor-grabbing'
const placeholderClass = 'bg-interactive-soft outline-2 outline-dashed -outline-offset-2 outline-primary/60 [&>*]:invisible'

export function ScheduleStageList({ projectId, phases, activities, conflictIds, nameFor, onSelect, canManage }: StageListProps) {
  const today = todayIso()
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities])
  const serverOrder = useMemo(() => buildOrder(phases, activities), [phases, activities])
  const serverKey = orderKey(serverOrder)

  const [draft, setDraft] = useState(serverOrder)
  const [syncedKey, setSyncedKey] = useState(serverKey)
  const [saving, startSaving] = useTransition()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const dragBase = useRef<Order | null>(null)

  // Adopt fresh server data (after a save, rename, or edit elsewhere) unless the builder is mid-drag or mid-save.
  if (serverKey !== syncedKey && !saving && !activeId) {
    setSyncedKey(serverKey)
    setDraft(serverOrder)
  }

  const phaseStats = draft.phases.map((p, index) => {
    const items = draft.items[p.id].map((id) => byId.get(id)).filter((a): a is ScheduleActivity => Boolean(a))
    const counted = items.filter((a) => a.status !== 'skipped')
    const done = counted.filter((a) => a.status === 'completed').length
    return {
      ...p,
      number: index + 1,
      items,
      done,
      counted: counted.length,
      complete: counted.length > 0 && done === counted.length,
      underway: items.some((a) => a.status === 'in_progress' || a.status === 'delayed'),
    }
  })
  // Only a phase with work actually underway is labelled current; nothing is inferred for a schedule that has not started.
  const currentId = phaseStats.find((s) => s.underway)?.id ?? null

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(phaseStats.filter((s) => s.complete).map((s) => s.id)))
  const allOpen = phaseStats.every((s) => !collapsed.has(s.id))
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const expand = (id: string) =>
    setCollapsed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })

  const commit = (next: Order, base: Order, message: string) => {
    if (orderKey(next) === orderKey(base)) {
      setDraft(base)
      return
    }
    setDraft(next)
    startSaving(async () => {
      const payload = {
        phases: next.phases.map((p) => p.id),
        activities: next.phases.flatMap((p) => next.items[p.id].map((id) => ({ id, phaseId: p.id }))),
      }
      const result = await reorderScheduleAction(projectId, payload)
      if (result?.error) {
        setDraft(base)
        setAnnouncement(`Order not saved. ${result.error}`)
        toast.error('Order not saved', { description: `${result.error} The previous order has been restored.` })
      } else {
        setAnnouncement(message)
      }
    })
  }

  const phaseName = (id: string) => draft.phases.find((p) => p.id === id)?.name ?? 'phase'
  const activityName = (id: string) => byId.get(id)?.name ?? 'Activity'

  const movePhaseBy = (phaseId: string, delta: -1 | 1) => {
    const from = draft.phases.findIndex((p) => p.id === phaseId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= draft.phases.length) return
    commit({ ...draft, phases: arrayMove(draft.phases, from, to) }, draft, `${phaseName(phaseId)} moved to position ${to + 1}.`)
  }
  const moveActivityBy = (activityId: string, delta: -1 | 1) => {
    const phaseId = phaseOf(draft, activityId)
    if (!phaseId) return
    const list = draft.items[phaseId]
    const from = list.indexOf(activityId)
    const to = from + delta
    if (to < 0 || to >= list.length) return
    commit(
      { ...draft, items: { ...draft.items, [phaseId]: arrayMove(list, from, to) } },
      draft,
      `${activityName(activityId)} moved ${delta < 0 ? 'above' : 'below'} ${activityName(list[to])}.`,
    )
  }
  const moveActivityToPhase = (activityId: string, phaseId: string) => {
    expand(phaseId)
    commit(
      moveActivity(draft, activityId, phaseId, draft.items[phaseId].length),
      draft,
      `${activityName(activityId)} moved to ${phaseName(phaseId)}.`,
    )
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short press-and-hold on the handle starts a touch drag, so swiping still scrolls the page.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  const collision: CollisionDetection = (args) => {
    const id = String(args.active.id)
    const phaseTargets = args.droppableContainers.filter((c) => String(c.id).startsWith(PHASE))
    if (id.startsWith(PHASE)) return closestCenter({ ...args, droppableContainers: phaseTargets })
    const activityTargets = args.droppableContainers.filter((c) => String(c.id).startsWith(ACT) && c.id !== args.active.id)
    const overPhase = pointerWithin({ ...args, droppableContainers: phaseTargets })[0]
    if (overPhase) {
      const phaseId = String(overPhase.id).slice(PHASE.length)
      const inPhase = activityTargets.filter((c) => draft.items[phaseId]?.includes(String(c.id).slice(ACT.length)))
      return inPhase.length ? closestCenter({ ...args, droppableContainers: inPhase }) : [overPhase]
    }
    return closestCenter({ ...args, droppableContainers: activityTargets })
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    dragBase.current = draft
    setActiveId(String(active.id))
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    const id = String(active.id)
    if (!over || !id.startsWith(ACT)) return
    const activityId = id.slice(ACT.length)
    const overId = String(over.id)
    setDraft((prev) => {
      const from = phaseOf(prev, activityId)
      let to: string | null
      let index: number
      if (overId.startsWith(PHASE)) {
        to = overId.slice(PHASE.length)
        index = prev.items[to]?.length ?? 0
      } else {
        const overActivity = overId.slice(ACT.length)
        to = phaseOf(prev, overActivity)
        if (!to) return prev
        const translated = active.rect.current.translated
        const below = translated ? translated.top > over.rect.top + over.rect.height / 2 : false
        index = prev.items[to].indexOf(overActivity) + (below ? 1 : 0)
      }
      if (!from || !to || from === to || !prev.items[to]) return prev
      return moveActivity(prev, activityId, to, index)
    })
    if (overId.startsWith(PHASE)) expand(overId.slice(PHASE.length))
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const base = dragBase.current
    dragBase.current = null
    setActiveId(null)
    if (!base) return
    if (!over) {
      setDraft(base)
      return
    }
    const id = String(active.id)
    const overId = String(over.id)
    if (id.startsWith(PHASE)) {
      const phaseId = id.slice(PHASE.length)
      const from = draft.phases.findIndex((p) => p.id === phaseId)
      const to = draft.phases.findIndex((p) => p.id === overId.slice(PHASE.length))
      if (from < 0 || to < 0) {
        setDraft(base)
        return
      }
      commit({ ...draft, phases: arrayMove(draft.phases, from, to) }, base, `${phaseName(phaseId)} moved to position ${to + 1}.`)
      return
    }
    const activityId = id.slice(ACT.length)
    const phaseId = phaseOf(draft, activityId)
    if (!phaseId) {
      setDraft(base)
      return
    }
    let next = draft
    if (overId.startsWith(ACT)) {
      const list = draft.items[phaseId]
      const from = list.indexOf(activityId)
      const to = list.indexOf(overId.slice(ACT.length))
      if (from >= 0 && to >= 0 && from !== to) next = { ...draft, items: { ...draft.items, [phaseId]: arrayMove(list, from, to) } }
    }
    const position = next.items[phaseId].indexOf(activityId)
    const neighbour = position > 0 ? `below ${activityName(next.items[phaseId][position - 1])}` : 'to the top'
    commit(next, base, `${activityName(activityId)} moved ${neighbour} in ${phaseName(phaseId)}.`)
  }

  const onDragCancel = () => {
    if (dragBase.current) setDraft(dragBase.current)
    dragBase.current = null
    setActiveId(null)
  }

  const actionLabel = canManage ? 'Edit' : 'View'
  const ActionIcon = canManage ? Pencil : Eye
  const draggingActivity = activeId?.startsWith(ACT) ? byId.get(activeId.slice(ACT.length)) : null
  const draggingPhase = activeId?.startsWith(PHASE) ? phaseStats.find((p) => p.id === activeId.slice(PHASE.length)) : null
  const otherPhaseNames = (phaseId: string) => draft.phases.filter((p) => p.id !== phaseId).map((p) => p.name.toLowerCase())

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted-foreground">
          {`${phaseStats.length} ${phaseStats.length === 1 ? 'phase' : 'phases'} · ${activities.length} ${activities.length === 1 ? 'activity' : 'activities'}`}
          {canManage && <span className="hidden tablet:inline">{' · Drag the handles to reorder'}</span>}
          {saving && <span className="text-primary">{' · Saving order…'}</span>}
        </p>
        <button
          type="button"
          onClick={() => setCollapsed(allOpen ? new Set(phaseStats.map((s) => s.id)) : new Set())}
          className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary transition-colors hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:min-h-8"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <SortableContext items={phaseStats.map((p) => PHASE + p.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-3">
            {phaseStats.map((phase, phaseIndex) => {
              const open = !collapsed.has(phase.id)
              const panelId = `phase-panel-${phase.id}`
              return (
                <SortablePhase
                  key={phase.id}
                  phase={phase}
                  canManage={canManage}
                  disabled={saving}
                  open={open}
                  isCurrent={phase.id === currentId}
                  panelId={panelId}
                  onToggle={() => toggle(phase.id)}
                  isFirst={phaseIndex === 0}
                  isLast={phaseIndex === phaseStats.length - 1}
                  onMove={(delta) => movePhaseBy(phase.id, delta)}
                  takenNames={otherPhaseNames(phase.id)}
                  projectId={projectId}
                  onRenamed={(name) => {
                    setDraft((prev) => ({ ...prev, phases: prev.phases.map((p) => (p.id === phase.id ? { ...p, name } : p)) }))
                    setAnnouncement(`Phase renamed to ${name}.`)
                  }}
                >
                  {open && (
                    <SortableContext items={phase.items.map((a) => ACT + a.id)} strategy={verticalListSortingStrategy}>
                      <ul id={panelId} className="divide-y divide-secondary border-t border-secondary">
                        <li
                          aria-hidden="true"
                          className="hidden bg-[#F8F9F7] text-[11px] font-semibold text-brand-deep/65 tablet:md:flex"
                        >
                          {canManage && <span className="w-8 shrink-0" />}
                          <span
                            className={cn(
                              'grid flex-1 grid-cols-[minmax(0,1fr)_9rem_11rem_8.5rem_5.5rem] gap-x-3 py-2 pr-5',
                              canManage ? 'grid-cols-[minmax(0,1fr)_9rem_11rem_8.5rem_8rem] pl-1' : 'pl-5',
                            )}
                          >
                            <span>Activity</span>
                            <span>Assigned</span>
                            <span>Planned</span>
                            <span>Progress</span>
                            <span />
                          </span>
                        </li>
                        {phase.items.length === 0 && (
                          <li className="px-5 py-4 text-sm italic text-muted-foreground">
                            {canManage ? 'No activities in this phase. Drag an activity here or use its Move menu.' : 'No activities in this phase.'}
                          </li>
                        )}
                        {phase.items.map((a, index) => {
                          const late = isOverdue(a, today)
                          const milestone = a.activity_type === 'milestone'
                          const assignee = nameFor(a.assigned_to)
                          const planned = plannedLabel(a)
                          const style = stageStyle(phase.name)
                          return (
                            <SortableActivity key={a.id} id={a.id} canManage={canManage} disabled={saving} milestone={milestone}>
                              <div
                                className={cn(
                                  'grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 pr-4 sm:pr-5',
                                  canManage ? 'pl-1' : 'pl-4 sm:pl-5',
                                  'md:grid-cols-[minmax(0,1fr)_9rem_11rem_8.5rem_auto]',
                                  canManage
                                    ? 'tablet:md:grid-cols-[minmax(0,1fr)_9rem_11rem_8.5rem_8rem]'
                                    : 'tablet:md:grid-cols-[minmax(0,1fr)_9rem_11rem_8.5rem_5.5rem]',
                                )}
                              >
                                <div className="flex min-w-0 flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() => onSelect(a)}
                                    className="flex min-w-0 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                  >
                                    {milestone && (
                                      <Diamond className="size-3.5 shrink-0" style={{ color: style.accent, fill: style.accent }} aria-label="Milestone" />
                                    )}
                                    <span className={cn('truncate text-sm text-brand-deep hover:underline', milestone ? 'font-semibold' : 'font-medium')}>
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
                                <span
                                  className={cn('hidden truncate text-sm tabular-nums md:block', planned ? 'text-foreground/80' : 'italic text-muted-foreground')}
                                >
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

                                <div className="col-start-2 row-start-1 flex items-center gap-1 self-start md:col-start-auto md:row-start-auto md:self-center">
                                  {canManage && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger
                                        disabled={saving}
                                        aria-label={`Move ${a.name}`}
                                        className={cn(iconButton, 'size-11 md:size-9')}
                                      >
                                        <MoreHorizontal className="size-4" aria-hidden="true" />
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="min-w-48">
                                        <DropdownMenuItem disabled={index === 0} onClick={() => moveActivityBy(a.id, -1)}>
                                          <ArrowUp aria-hidden="true" />
                                          Move up
                                        </DropdownMenuItem>
                                        <DropdownMenuItem disabled={index === phase.items.length - 1} onClick={() => moveActivityBy(a.id, 1)}>
                                          <ArrowDown aria-hidden="true" />
                                          Move down
                                        </DropdownMenuItem>
                                        {draft.phases.length > 1 && (
                                          <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuSub>
                                              <DropdownMenuSubTrigger>
                                                <FolderInput aria-hidden="true" />
                                                Move to phase
                                              </DropdownMenuSubTrigger>
                                              <DropdownMenuSubContent className="max-h-80 min-w-48 overflow-y-auto">
                                                {draft.phases
                                                  .filter((p) => p.id !== phase.id)
                                                  .map((p) => (
                                                    <DropdownMenuItem key={p.id} onClick={() => moveActivityToPhase(a.id, p.id)}>
                                                      {p.name}
                                                    </DropdownMenuItem>
                                                  ))}
                                              </DropdownMenuSubContent>
                                            </DropdownMenuSub>
                                          </>
                                        )}
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => onSelect(a)}
                                    aria-label={`${actionLabel} ${a.name}`}
                                    className="inline-flex size-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-white text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:h-9 md:w-auto md:px-3"
                                  >
                                    <ActionIcon className="size-4" aria-hidden="true" />
                                    <span className="hidden md:inline">{actionLabel}</span>
                                  </button>
                                </div>
                              </div>
                            </SortableActivity>
                          )
                        })}
                      </ul>
                    </SortableContext>
                  )}
                </SortablePhase>
              )
            })}
          </ol>
        </SortableContext>

        <DragOverlay dropAnimation={null}>
          {draggingActivity && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-white px-3 py-2.5 text-sm font-medium text-brand-deep shadow-lg">
              <GripVertical className="size-4 text-brand-deep/50" aria-hidden="true" />
              <span className="truncate">{draggingActivity.name}</span>
            </div>
          )}
          {draggingPhase && (
            <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-white px-4 py-3 shadow-lg">
              <GripVertical className="size-4 text-brand-deep/50" aria-hidden="true" />
              <span className="font-mono text-xs tabular-nums text-brand-deep/65">{String(draggingPhase.number).padStart(2, '0')}</span>
              <span className="type-record-name text-brand-deep">{draggingPhase.name}</span>
              <span className="text-xs text-muted-foreground">
                {`${draggingPhase.items.length} ${draggingPhase.items.length === 1 ? 'activity' : 'activities'}`}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function SortableActivity({
  id,
  canManage,
  disabled,
  milestone,
  children,
}: {
  id: string
  canManage: boolean
  disabled: boolean
  milestone: boolean
  children: ReactNode
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: ACT + id,
    disabled: !canManage || disabled,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('flex items-stretch', milestone && 'bg-[#F8F7F3]', isDragging && placeholderClass)}
    >
      {canManage && (
        <span ref={setActivatorNodeRef} {...listeners} aria-hidden="true" title="Drag to reorder" className={handleClass}>
          <GripVertical className="size-4" />
        </span>
      )}
      {children}
    </li>
  )
}

type PhaseView = {
  id: string
  name: string
  number: number
  items: ScheduleActivity[]
  done: number
  counted: number
  complete: boolean
}

function SortablePhase({
  phase,
  canManage,
  disabled,
  open,
  isCurrent,
  panelId,
  onToggle,
  isFirst,
  isLast,
  onMove,
  takenNames,
  projectId,
  onRenamed,
  children,
}: {
  phase: PhaseView
  canManage: boolean
  disabled: boolean
  open: boolean
  isCurrent: boolean
  panelId: string
  onToggle: () => void
  isFirst: boolean
  isLast: boolean
  onMove: (delta: -1 | 1) => void
  takenNames: string[]
  projectId: string
  onRenamed: (name: string) => void
  children: ReactNode
}) {
  const { setNodeRef, setActivatorNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: PHASE + phase.id,
    disabled: !canManage || disabled,
  })
  const [editing, setEditing] = useState(false)
  const pencilRef = useRef<HTMLButtonElement>(null)
  const style = stageStyle(phase.name)
  const StageIcon = style.icon

  const closeEditor = () => {
    setEditing(false)
    requestAnimationFrame(() => pencilRef.current?.focus())
  }

  return (
    <li
      ref={setNodeRef}
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-shadow',
        isCurrent ? 'border-primary/35 shadow-[0_1px_0_0_var(--primary)_inset,0_4px_14px_-10px_rgb(16_59_39/0.45)]' : 'border-border',
        'tablet:border-l-[3px] tablet:border-l-(--stage-accent)',
        isDragging && placeholderClass,
      )}
      style={{ '--stage-accent': style.accent, transform: CSS.Translate.toString(transform), transition } as CSSProperties}
    >
      <div className="flex items-stretch">
        {canManage && (
          <span ref={setActivatorNodeRef} {...listeners} aria-hidden="true" title="Drag to reorder phase" className={handleClass}>
            <GripVertical className="size-4" />
          </span>
        )}
        {editing ? (
          <PhaseNameEditor
            projectId={projectId}
            phaseId={phase.id}
            initialName={phase.name}
            takenNames={takenNames}
            onCancel={closeEditor}
            onSaved={(name) => {
              onRenamed(name)
              closeEditor()
            }}
          />
        ) : (
          <h3 className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 py-3 pr-3 text-left transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary tablet:gap-4 tablet:py-3.5',
                canManage ? 'pl-1' : 'pl-4 sm:pl-5',
              )}
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
                  <span className="font-mono text-xs font-medium tabular-nums text-brand-deep/65">{String(phase.number).padStart(2, '0')}</span>
                  <span className="type-record-name text-brand-deep">{phase.name}</span>
                  {isCurrent && <span className="rounded-badge bg-primary px-2 py-0.5 text-[11px] font-medium text-white">Current phase</span>}
                  {phase.complete && (
                    <span className="rounded-badge bg-[#E2F3E9] px-2 py-0.5 text-[11px] font-medium text-[#187542]">Complete</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {phase.items.length === 0
                    ? 'No activities'
                    : phase.counted > 0
                      ? `${phase.done} of ${phase.counted} complete`
                      : 'All activities skipped'}
                  {phase.items.length !== phase.counted && phase.counted > 0 ? ` · ${phase.items.length - phase.counted} skipped` : ''}
                </span>
              </span>
              {phase.counted > 0 && (
                <span className="hidden w-28 shrink-0 flex-col items-end gap-1 tablet:flex" aria-hidden="true">
                  <span className="text-xs font-semibold tabular-nums text-brand-deep">{`${Math.round((phase.done / phase.counted) * 100)}%`}</span>
                  <span className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${(phase.done / phase.counted) * 100}%`, backgroundColor: style.accent }}
                    />
                  </span>
                </span>
              )}
              <ChevronDown
                className={cn('size-5 shrink-0 text-brand-deep/60 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
          </h3>
        )}
        {canManage && !editing && (
          <div className="flex shrink-0 items-center gap-0.5 pr-2 sm:pr-3">
            <button
              ref={pencilRef}
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Rename phase ${phase.name}`}
              title="Rename phase"
              className={cn(iconButton, 'size-11 sm:size-9')}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger disabled={disabled} aria-label={`Move phase ${phase.name}`} className={cn(iconButton, 'size-11 sm:size-9')}>
                <MoreHorizontal className="size-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-44">
                <DropdownMenuItem disabled={isFirst} onClick={() => onMove(-1)}>
                  <ArrowUp aria-hidden="true" />
                  Move phase up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={isLast} onClick={() => onMove(1)}>
                  <ArrowDown aria-hidden="true" />
                  Move phase down
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {children}
    </li>
  )
}

function PhaseNameEditor({
  projectId,
  phaseId,
  initialName,
  takenNames,
  onCancel,
  onSaved,
}: {
  projectId: string
  phaseId: string
  initialName: string
  takenNames: string[]
  onCancel: () => void
  onSaved: (name: string) => void
}) {
  const [value, setValue] = useState(initialName)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const errorId = `phase-name-error-${phaseId}`

  const save = () => {
    const name = value.trim().replace(/\s+/g, ' ')
    if (!name) return setError('Enter a phase name.')
    if (name.length > MAX_PHASE_NAME) return setError(`Use ${MAX_PHASE_NAME} characters or fewer.`)
    if (takenNames.includes(name.toLowerCase())) return setError('Another phase on this schedule already uses that name.')
    if (name === initialName) return onCancel()
    setError(null)
    startTransition(async () => {
      const result = await renamePhaseAction(projectId, phaseId, name)
      if (result?.error) setError(result.error)
      else onSaved(name)
    })
  }

  return (
    <form
      className="flex min-h-14 flex-1 flex-col justify-center gap-1 py-2 pl-1 pr-3 sm:pr-4"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`phase-name-${phaseId}`} className="sr-only">
          Phase name
        </label>
        <input
          id={`phase-name-${phaseId}`}
          autoFocus
          value={value}
          maxLength={MAX_PHASE_NAME + 20}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onCancel()
            } else if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) {
              e.preventDefault()
            }
          }}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-white px-3 text-base font-semibold text-brand-deep md:text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 aria-invalid:border-destructive sm:h-9"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md border border-action-border bg-action font-semibold text-action-foreground hover:bg-action-hover active:bg-action-pressed px-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:h-9"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-10 items-center rounded-md border border-border bg-white px-3 text-sm font-medium text-brand-deep transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 sm:h-9"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
