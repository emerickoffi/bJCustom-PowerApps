'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import {
  AlertTriangle,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  Link2,
  Maximize2,
  Search,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/shared/page-header'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { cn } from '@/lib/utils'
import { pillClass, segmentClass } from '@/lib/interaction-styles'
import { formatDate, APP_TIME_ZONE } from '@/lib/format'
import { todayInZone } from '@/lib/activity-history'
import { stageStyle, type StageStyle } from '@/lib/schedule-stage-style'
import { ACTIVITY_STATUSES, ACTIVITY_STATUS_LABELS, isOverdue, type ScheduleActivity, type ScheduleDependency } from '@/lib/schedule'
import type { ActivityAssignment } from '@/lib/assignments'
import {
  EMPTY_FILTERS,
  INCOMPLETE_LABELS,
  ZOOMS,
  ZOOM_PX,
  analyzeDependencies,
  chartRange,
  dayNumber,
  fillRange,
  firstSaturdayOffset,
  fitZoom,
  offChartReason,
  hasActiveFilters,
  headerTicks,
  isoFromDay,
  matchesFilters,
  phaseSpan,
  placeActivity,
  placementEnd,
  placementStart,
  spanLabel,
  type GanttFilters,
  type Placement,
  type Zoom,
} from '@/lib/schedule-gantt'

const ROW_H = 44
const HEADER_H = 48
const UNSCHEDULED_PREVIEW = 5
const NAME_MIN = 160
const NAME_MAX = 480
const ZOOM_LABELS: Record<Zoom, string> = { day: 'Day', week: 'Week', month: 'Month' }

type Placed = Exclude<Placement, { kind: 'incomplete' }>

type Row =
  | { type: 'phase'; key: string; phase: string; style: StageStyle; span: { start: number; end: number } | null; count: number; open: boolean }
  | { type: 'activity'; activity: ScheduleActivity; placement: Placed; style: StageStyle }

export type GanttBaseline = {
  version: number
  name: string
  dates: Record<string, { start: string | null; end: string | null }>
}

function baselineSpan(baseline: GanttBaseline | null | undefined, id: string) {
  const entry = baseline?.dates[id]
  const start = dayNumber(entry?.start)
  const end = dayNumber(entry?.end ?? entry?.start)
  if (start === null || end === null || end < start) return null
  return { start, end }
}

export type ScheduleGanttProps = {
  baseline?: GanttBaseline | null
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  conflictIds: Set<string>
  nameFor: (userId: string | null) => string | null
  onSelect: (activity: ScheduleActivity) => void
  selectedId?: string | null
  canManage?: boolean
  timeZone?: string
  assignmentsByActivity?: Map<string, ActivityAssignment[]>
}

function groupKeys(activities: ScheduleActivity[]) {
  const groups: { key: string; phase: string; items: ScheduleActivity[] }[] = []
  for (const a of activities) {
    const last = groups[groups.length - 1]
    if (last && last.phase === a.phase) last.items.push(a)
    else groups.push({ key: `${groups.length}:${a.phase}`, phase: a.phase, items: [a] })
  }
  return groups
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function datesText(p: Placement) {
  if (p.kind === 'bar') return `${formatDate(isoFromDay(p.start))} – ${formatDate(isoFromDay(p.end))} (${spanLabel(p.start, p.end)})`
  if (p.kind === 'milestone') return formatDate(isoFromDay(p.day))
  return INCOMPLETE_LABELS[p.reason]
}

export function ScheduleGantt({
  activities,
  dependencies,
  conflictIds,
  nameFor,
  onSelect,
  selectedId = null,
  canManage = false,
  timeZone = APP_TIME_ZONE,
  assignmentsByActivity,
  baseline = null,
}: ScheduleGanttProps) {
  const [showBaseline, setShowBaseline] = useState(false)
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false)
  const [unscheduledOpen, setUnscheduledOpen] = useState(false)
  const [timelineW, setTimelineW] = useState(0)
  const [nameW, setNameW] = useState<number | null>(null)
  const baselineOn = showBaseline && !!baseline
  const uid = useId()
  const today = useMemo(() => todayInZone(timeZone), [timeZone])
  const todayDay = dayNumber(today) as number
  const [zoom, setZoom] = useState<Zoom>('week')
  const [filters, setFilters] = useState<GanttFilters>(EMPTY_FILTERS)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [peek, setPeek] = useState<{ id: string; left: number } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nameColRef = useRef<HTMLDivElement>(null)
  const down = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const px = ZOOM_PX[zoom]

  const placements = useMemo(() => new Map(activities.map((a) => [a.id, placeActivity(a)])), [activities])
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities])

  const subsFor = useCallback(
    (id: string) => (assignmentsByActivity?.get(id) ?? []).filter((x) => x.status === 'active'),
    [assignmentsByActivity],
  )
  const companiesFor = useCallback((id: string) => subsFor(id).map((x) => x.subcontractor_company_id), [subsFor])

  const filterOptions = useMemo(() => {
    const phases = [...new Set(activities.map((a) => a.phase))]
    const assignees = [...new Set(activities.map((a) => a.assigned_to).filter(Boolean) as string[])]
      .map((id) => ({ value: id, label: nameFor(id) ?? 'Former team member' }))
      .sort((x, y) => x.label.localeCompare(y.label))
    const companies = new Map<string, string>()
    for (const a of activities) for (const s of subsFor(a.id)) companies.set(s.subcontractor_company_id, s.company_name)
    return {
      phases,
      assignees,
      companies: [...companies].map(([value, label]) => ({ value, label })).sort((x, y) => x.label.localeCompare(y.label)),
    }
  }, [activities, nameFor, subsFor])

  const visible = useMemo(
    () => activities.filter((a) => matchesFilters(a, filters, companiesFor)),
    [activities, filters, companiesFor],
  )
  const visibleIds = useMemo(() => new Set(visible.map((a) => a.id)), [visible])

  const { rows, rowIndex, phaseKeys } = useMemo(() => {
    const out: Row[] = []
    const keys: string[] = []
    for (const g of groupKeys(activities)) {
      keys.push(g.key)
      const shown = g.items.filter((a) => visibleIds.has(a.id) && placements.get(a.id)!.kind !== 'incomplete')
      if (!shown.length) continue
      const style = stageStyle(g.phase)
      const open = !collapsed.has(g.key)
      out.push({ type: 'phase', key: g.key, phase: g.phase, style, span: phaseSpan(g.items.map((a) => placements.get(a.id)!)), count: shown.length, open })
      if (open) for (const a of shown) out.push({ type: 'activity', activity: a, placement: placements.get(a.id) as Placed, style })
    }
    const index = new Map<string, number>()
    out.forEach((r, i) => r.type === 'activity' && index.set(r.activity.id, i))
    return { rows: out, rowIndex: index, phaseKeys: keys }
  }, [activities, visibleIds, placements, collapsed])

  const unscheduled = visible.filter((a) => placements.get(a.id)!.kind === 'incomplete')
  const placedVisible = visible.filter((a) => placements.get(a.id)!.kind !== 'incomplete')

  const deps = useMemo(() => {
    const analysis = analyzeDependencies(dependencies, new Set(byId.keys()), new Set(rowIndex.keys()))
    const preds = new Map<string, string[]>()
    const succs = new Map<string, string[]>()
    const hiddenPreds = new Map<string, number>()
    const hiddenSuccs = new Map<string, number>()
    const drawn: ScheduleDependency[] = []
    const missing: ScheduleDependency[] = []
    const cycles: ScheduleDependency[] = []
    let offChart = 0
    const offReasons: Record<'filtered' | 'collapsed' | 'undated', number> = { filtered: 0, collapsed: 0, undated: 0 }
    const undated = new Set([...placements].filter(([, p]) => p.kind === 'incomplete').map(([id]) => id))
    for (const { dep, state } of analysis) {
      if (state !== 'missing' && state !== 'cycle' && state !== 'drawn') {
        const reasons = new Set(
          [dep.predecessor_id, dep.successor_id].filter((id) => !rowIndex.has(id)).map((id) => offChartReason(id, visibleIds, undated)),
        )
        for (const r of reasons) offReasons[r] += 1
      }
      if (state === 'missing') missing.push(dep)
      else if (state === 'cycle') cycles.push(dep)
      else {
        preds.set(dep.successor_id, [...(preds.get(dep.successor_id) ?? []), byId.get(dep.predecessor_id)!.name])
        succs.set(dep.predecessor_id, [...(succs.get(dep.predecessor_id) ?? []), byId.get(dep.successor_id)!.name])
        if (state === 'drawn') drawn.push(dep)
        else offChart += 1
        if (state === 'hidden_predecessor') hiddenPreds.set(dep.successor_id, (hiddenPreds.get(dep.successor_id) ?? 0) + 1)
        if (state === 'hidden_successor') hiddenSuccs.set(dep.predecessor_id, (hiddenSuccs.get(dep.predecessor_id) ?? 0) + 1)
      }
    }
    return { preds, succs, hiddenPreds, hiddenSuccs, drawn, missing, cycles, offChart, offReasons }
  }, [dependencies, byId, rowIndex, placements, visibleIds])

  const baseRange = useMemo(() => {
    const days: number[] = []
    for (const p of placements.values()) {
      const s = placementStart(p)
      const e = placementEnd(p)
      if (s !== null && e !== null) days.push(s, e)
    }
    if (baselineOn) {
      for (const a of activities) {
        const b = baselineSpan(baseline, a.id)
        if (b) days.push(b.start, b.end)
      }
    }
    return chartRange(days, todayDay)
  }, [placements, todayDay, baselineOn, baseline, activities])
  const range = useMemo(() => fillRange(baseRange, timelineW, px), [baseRange, timelineW, px])

  const totalDays = range.end - range.start + 1
  const chartW = totalDays * px
  const bodyH = rows.length * ROW_H
  const x = (day: number) => (day - range.start) * px
  const ticks = useMemo(() => headerTicks(range.start, range.end, zoom), [range, zoom])

  const pending = useRef<{ day: number; align: 'start' | 'quarter' } | null>(null)
  if (pending.current === null && !scrollRef.current) {
    const starts = activities.map((a) => placementStart(placements.get(a.id)!)).filter((d): d is number => d !== null)
    const ends = activities.map((a) => placementEnd(placements.get(a.id)!)).filter((d): d is number => d !== null)
    const inside = starts.length && todayDay >= Math.min(...starts) && todayDay <= Math.max(...ends)
    pending.current = { day: inside || !starts.length ? todayDay : Math.min(...starts), align: inside ? 'quarter' : 'start' }
  }

  const viewWidth = () => {
    const el = scrollRef.current
    return el ? el.clientWidth - (nameColRef.current?.offsetWidth ?? 256) : 0
  }

  const applyPending = useCallback(() => {
    const el = scrollRef.current
    const target = pending.current
    if (!el || !target || el.clientWidth === 0) return
    const view = el.clientWidth - (nameColRef.current?.offsetWidth ?? 256)
    const offset = target.align === 'start' ? 16 : view * 0.25
    el.scrollLeft = Math.max(0, (target.day - range.start) * ZOOM_PX[zoom] - offset)
    pending.current = null
  }, [range.start, zoom])

  useLayoutEffect(applyPending)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setTimelineW(Math.max(0, el.clientWidth - (nameColRef.current?.offsetWidth ?? 256)))
      applyPending()
    })
    observer.observe(el)
    if (nameColRef.current) observer.observe(nameColRef.current)
    return () => observer.disconnect()
  }, [applyPending, rows.length === 0])

  const resizeNameCol = (next: number) => {
    const max = Math.min(NAME_MAX, Math.max(NAME_MIN, (scrollRef.current?.clientWidth ?? 800) * 0.5))
    setNameW(Math.round(Math.max(NAME_MIN, Math.min(max, next))))
  }

  const centerDay = () => {
    const el = scrollRef.current
    if (!el) return todayDay
    return range.start + Math.round((el.scrollLeft + viewWidth() * 0.25) / px)
  }

  const changeZoom = (z: Zoom) => {
    if (z === zoom) return
    pending.current = { day: centerDay(), align: 'quarter' }
    setZoom(z)
  }

  const goToday = () => {
    pending.current = { day: todayDay, align: 'quarter' }
    applyPending()
  }

  const page = (dir: -1 | 1) => {
    scrollRef.current?.scrollBy({ left: dir * viewWidth() * 0.8, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  const fit = () => {
    const spans = placedVisible.map((a) => placements.get(a.id)!)
    const span = phaseSpan(spans)
    if (!span) {
      setNotice('No activities with complete planned dates match the current filters.')
      return
    }
    setNotice(null)
    const z = fitZoom(span.end - span.start + 5, Math.max(200, viewWidth() - 32))
    pending.current = { day: span.start - 2, align: 'start' }
    if (z === zoom) applyPending()
    else setZoom(z)
  }

  const wasDrag = (e: MouseEvent) => {
    const d = down.current
    const el = scrollRef.current
    if (e.detail === 0 || !d || !el) return false
    return Math.abs(e.clientX - d.x) > 8 || Math.abs(e.clientY - d.y) > 8 || Math.abs(el.scrollLeft - d.sl) > 4 || Math.abs(el.scrollTop - d.st) > 4
  }
  const select = (e: MouseEvent, a: ScheduleActivity) => {
    if (!wasDrag(e)) onSelect(a)
  }

  const showPeek = (a: ScheduleActivity, placement: Placed) => {
    const el = scrollRef.current
    const barLeft = x(placementStart(placement)!)
    if (!el) return setPeek({ id: a.id, left: barLeft })
    const view = viewWidth()
    setPeek({ id: a.id, left: Math.max(el.scrollLeft + 8, Math.min(barLeft, el.scrollLeft + view - 296)) })
  }

  const revealBar = (placement: Placed, target: HTMLElement) => {
    const el = scrollRef.current
    if (!el || !target.matches(':focus-visible')) return
    const s = x(placementStart(placement)!)
    const e = x(placementEnd(placement)! + 1)
    const view = viewWidth()
    if (s < el.scrollLeft || e > el.scrollLeft + view) el.scrollLeft = Math.max(0, s - view * 0.25)
  }

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const describe = (a: ScheduleActivity, p: Placed) => {
    const parts = [`${a.phase}.`, `${a.activity_type === 'milestone' ? 'Milestone' : 'Planned'} ${datesText(p)}.`]
    parts.push(`${ACTIVITY_STATUS_LABELS[a.status]}, ${Math.round(Number(a.percent_complete))}% complete.`)
    const who = nameFor(a.assigned_to)
    if (who) parts.push(`Assigned to ${who}.`)
    const subs = subsFor(a.id)
    if (subs.length) parts.push(`Subcontractors: ${subs.map((s) => s.company_name).join(', ')}.`)
    const preds = deps.preds.get(a.id)
    if (preds?.length) parts.push(`Starts after ${preds.join(', ')} finishes.`)
    const succs = deps.succs.get(a.id)
    if (succs?.length) parts.push(`Followed by ${succs.join(', ')}.`)
    const hp = deps.hiddenPreds.get(a.id) ?? 0
    if (hp) parts.push(`${hp} ${hp === 1 ? 'predecessor is' : 'predecessors are'} not shown in the chart.`)
    if (isOverdue(a, today)) parts.push('Past due.')
    if (conflictIds.has(a.id)) parts.push('Planned to start before a predecessor finishes.')
    return parts.join(' ')
  }

  if (!activities.length) {
    return (
      <EmptyState
        icon={CalendarRange}
        title="No activities yet"
        description="Add schedule activities with planned start and finish dates to build the Gantt chart."
      />
    )
  }

  const filtered = hasActiveFilters(filters)
  const allKeys = phaseKeys
  const legendPhases = rows.filter((r): r is Extract<Row, { type: 'phase' }> => r.type === 'phase')
  const weekendShade = zoom !== 'month'
  const satOffset = firstSaturdayOffset(range.start)
  const peekRow = peek ? rowIndex.get(peek.id) : undefined
  const peekActivity = peek ? byId.get(peek.id) : undefined
  const markerId = `${uid}-arrow`

  return (
    <section className="flex flex-col gap-3" aria-label="Gantt chart">
      <div className="flex flex-col gap-3 rounded-xl border border-[#D6DDE5] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => page(-1)} aria-label="Previous date range">
              <ChevronLeft />
            </Button>
            <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => page(1)} aria-label="Next date range">
              <ChevronRight />
            </Button>
          </div>
          <div role="group" aria-label="Zoom" className="flex rounded-lg border border-[#D6DDE5] bg-[#F7F9FB] p-0.5">
            {ZOOMS.map((z) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoom === z}
                onClick={() => changeZoom(z)}
                className={cn('min-h-10 rounded-md px-3 text-sm font-medium sm:min-h-8', segmentClass(zoom === z))}
              >
                {ZOOM_LABELS[z]}
              </button>
            ))}
          </div>
          <Button variant="outline" className="min-h-11 sm:min-h-9" onClick={fit}>
            <Maximize2 data-icon="inline-start" />
            Fit project
          </Button>
          {baseline && (
            <button
              type="button"
              aria-pressed={showBaseline}
              onClick={() => setShowBaseline((v) => !v)}
              className={cn('min-h-11 rounded-full px-3 text-sm font-medium sm:min-h-9', pillClass(showBaseline))}
              title={baseline.name}
            >
              {`Baseline v${baseline.version}`}
            </button>
          )}
          <div className="flex items-center gap-1 sm:ml-auto">
            <Button variant="ghost" className="min-h-11 sm:min-h-9" disabled={collapsed.size === 0} onClick={() => setCollapsed(new Set())}>
              <ChevronsUpDown data-icon="inline-start" />
              Expand all
            </Button>
            <Button variant="ghost" className="min-h-11 sm:min-h-9" disabled={collapsed.size === allKeys.length} onClick={() => setCollapsed(new Set(allKeys))}>
              <ChevronsDownUp data-icon="inline-start" />
              Collapse all
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[#526173]" aria-hidden="true" />
            <label htmlFor={`${uid}-search`} className="sr-only">
              Search activities
            </label>
            <Input
              id={`${uid}-search`}
              type="search"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Search activities"
              className="h-11 pl-8 sm:h-9"
            />
          </div>
          <FilterSelect
            id={`${uid}-phase`}
            label="Phase"
            allLabel="All phases"
            value={filters.phase}
            options={filterOptions.phases.map((p) => ({ value: p, label: p }))}
            onChange={(phase) => setFilters((f) => ({ ...f, phase }))}
          />
          <FilterSelect
            id={`${uid}-status`}
            label="Status"
            allLabel="All statuses"
            value={filters.status}
            options={ACTIVITY_STATUSES.map((s) => ({ value: s, label: ACTIVITY_STATUS_LABELS[s] }))}
            onChange={(status) => setFilters((f) => ({ ...f, status: status as GanttFilters['status'] }))}
          />
          {filterOptions.assignees.length > 0 && (
            <FilterSelect
              id={`${uid}-assignee`}
              label="Assignee"
              allLabel="All assignees"
              value={filters.assignee}
              options={filterOptions.assignees}
              onChange={(assignee) => setFilters((f) => ({ ...f, assignee }))}
            />
          )}
          {filterOptions.companies.length > 0 && (
            <FilterSelect
              id={`${uid}-company`}
              label="Subcontractor"
              allLabel="All subcontractors"
              value={filters.company}
              options={filterOptions.companies}
              onChange={(company) => setFilters((f) => ({ ...f, company }))}
            />
          )}
        </div>
        {filtered && (
          <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
            <span className="text-[#526173]">{`Showing ${visible.length} of ${activities.length} activities`}</span>
            {filters.search.trim() && <Chip label={`Search: ${filters.search.trim()}`} onClear={() => setFilters((f) => ({ ...f, search: '' }))} />}
            {filters.phase && <Chip label={`Phase: ${filters.phase}`} onClear={() => setFilters((f) => ({ ...f, phase: null }))} />}
            {filters.status && <Chip label={`Status: ${ACTIVITY_STATUS_LABELS[filters.status]}`} onClear={() => setFilters((f) => ({ ...f, status: null }))} />}
            {filters.assignee && (
              <Chip label={`Assignee: ${nameFor(filters.assignee) ?? 'Former team member'}`} onClear={() => setFilters((f) => ({ ...f, assignee: null }))} />
            )}
            {filters.company && (
              <Chip
                label={`Subcontractor: ${filterOptions.companies.find((c) => c.value === filters.company)?.label ?? 'Company'}`}
                onClear={() => setFilters((f) => ({ ...f, company: null }))}
              />
            )}
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="min-h-8 px-1 font-medium text-interactive-strong underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
        )}
        {notice && (
          <p className="text-xs text-[#526173]" role="status">
            {notice}
          </p>
        )}
      </div>

      {(deps.missing.length > 0 || deps.cycles.length > 0) && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-foreground" role="note">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p>
            {[
              deps.missing.length > 0 &&
                `${deps.missing.length} saved ${deps.missing.length === 1 ? 'dependency points' : 'dependencies point'} to an activity no longer on this schedule.`,
              deps.cycles.length > 0 &&
                `${deps.cycles.length} saved ${deps.cycles.length === 1 ? 'dependency forms' : 'dependencies form'} a loop (${[...new Set(deps.cycles.flatMap((d) => [byId.get(d.predecessor_id)?.name, byId.get(d.successor_id)?.name]))].filter(Boolean).join(', ')}).`,
              'They are not drawn. Review them in the activity editor.',
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-[#D6DDE5] bg-white px-4 py-7 text-center">
          <span aria-hidden="true" className="mb-1 flex size-9 items-center justify-center rounded-lg bg-interactive-soft text-primary">
            <CalendarRange className="size-4" />
          </span>
          <p className="text-sm font-medium text-[#17212B]">
            {filtered && placedVisible.length === 0 && visible.length === 0 ? 'No activities match these filters' : 'Nothing to draw yet'}
          </p>
          <p className="max-w-md text-sm text-[#526173]">
            {filtered && visible.length === 0
              ? 'Adjust or clear the filters to see activities on the chart.'
              : 'Activities appear on the chart once they have valid planned start and finish dates. Milestones need one planned date.'}
          </p>
          {filtered && visible.length === 0 && (
            <Button variant="outline" className="mt-1" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#D6DDE5] bg-white">
          <div
            ref={scrollRef}
            className="max-h-[min(70vh,44rem)] overflow-auto overscroll-contain"
            onPointerDownCapture={(e) => {
              const el = scrollRef.current
              down.current = { x: e.clientX, y: e.clientY, sl: el?.scrollLeft ?? 0, st: el?.scrollTop ?? 0 }
            }}
          >
            <div className="flex w-max">
              <div
                ref={nameColRef}
                className={cn('sticky left-0 z-20 shrink-0 border-r border-[#D6DDE5] bg-white', nameW === null && 'w-44 sm:w-64')}
                style={nameW === null ? undefined : { width: nameW }}
              >
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize activity column"
                  aria-valuemin={NAME_MIN}
                  aria-valuemax={NAME_MAX}
                  aria-valuenow={nameW ?? nameColRef.current?.offsetWidth ?? 256}
                  tabIndex={0}
                  className="absolute inset-y-0 -right-1.5 z-30 w-3 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-transparent hover:after:bg-interactive/60 focus-visible:outline-none focus-visible:after:bg-interactive"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    const startX = e.clientX
                    const startW = nameColRef.current?.offsetWidth ?? 256
                    const target = e.currentTarget
                    const move = (ev: PointerEvent) => resizeNameCol(startW + ev.clientX - startX)
                    const up = () => {
                      target.removeEventListener('pointermove', move)
                      target.removeEventListener('pointerup', up)
                      target.removeEventListener('pointercancel', up)
                    }
                    target.addEventListener('pointermove', move)
                    target.addEventListener('pointerup', up)
                    target.addEventListener('pointercancel', up)
                  }}
                  onKeyDown={(e) => {
                    const w = nameColRef.current?.offsetWidth ?? 256
                    if (e.key === 'ArrowLeft') resizeNameCol(w - 16)
                    else if (e.key === 'ArrowRight') resizeNameCol(w + 16)
                    else if (e.key === 'Home') resizeNameCol(NAME_MIN)
                    else if (e.key === 'End') resizeNameCol(NAME_MAX)
                    else return
                    e.preventDefault()
                  }}
                />
                <div
                  className="sticky top-0 z-10 flex items-end border-b border-[#D6DDE5] bg-[#E9EDF2] px-3 pb-1.5 text-xs font-medium text-[#526173]"
                  style={{ height: HEADER_H }}
                >
                  Activity
                </div>
                {rows.map((row) =>
                  row.type === 'phase' ? (
                    <button
                      key={row.key}
                      type="button"
                      aria-expanded={row.open}
                      onClick={() => toggle(row.key)}
                      className="flex w-full items-center gap-2 border-b border-l-[3px] border-b-[#E4E9EF] bg-[#F7F9FB] px-2.5 text-left hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-interactive"
                      style={{ height: ROW_H, borderLeftColor: row.style.accent }}
                    >
                      <ChevronDown className={cn('size-4 shrink-0 text-[#526173] transition-transform motion-reduce:transition-none', !row.open && '-rotate-90')} aria-hidden="true" />
                      <row.style.icon className="size-4 shrink-0" style={{ color: row.style.accent }} aria-hidden="true" />
                      <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-[#17212B]">{row.phase}</span>
                      <span className="ml-auto shrink-0 text-xs tabular-nums text-[#526173]">{row.count}</span>
                    </button>
                  ) : (
                    <NameCell
                      key={row.activity.id}
                      row={row}
                      today={today}
                      conflict={conflictIds.has(row.activity.id)}
                      selected={selectedId === row.activity.id}
                      descriptionId={`${uid}-d-${row.activity.id}`}
                      description={describe(row.activity, row.placement)}
                      onClick={(e) => select(e, row.activity)}
                      onFocus={(e) => {
                        showPeek(row.activity, row.placement)
                        revealBar(row.placement, e.currentTarget)
                      }}
                      onBlur={() => setPeek(null)}
                    />
                  ),
                )}
              </div>

              <div className="relative shrink-0" style={{ width: chartW }}>
                <div className="sticky top-0 z-10 border-b border-[#D6DDE5] bg-[#E9EDF2] text-xs text-[#526173]" style={{ height: HEADER_H }}>
                  <div className="relative h-6">
                    {ticks.major.map((t) => (
                      <span
                        key={t.day}
                        className="absolute inset-y-0 flex items-center whitespace-nowrap border-l border-[#C7D0DA] pl-1.5 font-medium text-[#17212B]"
                        style={{ left: x(t.day) }}
                      >
                        {t.label}
                      </span>
                    ))}
                  </div>
                  <div className="relative h-6">
                    {ticks.minor.map((t) => (
                      <span
                        key={t.day}
                        className={cn('absolute inset-y-0 flex items-center whitespace-nowrap tabular-nums', zoom === 'day' ? 'justify-center' : 'pl-1')}
                        style={{ left: x(t.day), width: zoom === 'day' ? px : undefined }}
                      >
                        {t.label}
                      </span>
                    ))}
                    <span
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-interactive px-1.5 py-px text-[10px] font-semibold text-white"
                      style={{ left: x(todayDay) + px / 2 }}
                    >
                      Today
                    </span>
                  </div>
                </div>

                <div className="relative" style={{ height: bodyH }}>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={
                      weekendShade
                        ? {
                            backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${5 * px}px, rgba(23,33,43,0.045) ${5 * px}px ${7 * px}px)`,
                            backgroundPositionX: (satOffset - 5) * px,
                          }
                        : undefined
                    }
                  >
                    {ticks.minor.map((t) => (
                      <span key={`m${t.day}`} className="absolute inset-y-0 w-px bg-[#EEF1F4]" style={{ left: x(t.day) }} />
                    ))}
                    {ticks.major.map((t) => (
                      <span key={`M${t.day}`} className="absolute inset-y-0 w-px bg-[#D6DDE5]" style={{ left: x(t.day) }} />
                    ))}
                    <span className="absolute inset-y-0 w-0.5 bg-interactive/80" style={{ left: x(todayDay) + px / 2 - 1 }} />
                  </div>

                  <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] overflow-visible" width={chartW} height={bodyH}>
                    <defs>
                      <marker id={markerId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                        <path d="M0,0 L8,4 L0,8 z" fill="#526173" />
                      </marker>
                    </defs>
                    {deps.drawn.map((d) => {
                      const pi = rowIndex.get(d.predecessor_id)!
                      const si = rowIndex.get(d.successor_id)!
                      const pp = (rows[pi] as Extract<Row, { type: 'activity' }>).placement
                      const sp = (rows[si] as Extract<Row, { type: 'activity' }>).placement
                      const x1 = pp.kind === 'bar' ? x(pp.end + 1) : x(pp.day) + px / 2 + 8
                      const x2 = sp.kind === 'bar' ? x(sp.start) : x(sp.day) + px / 2 - 8
                      const y1 = pi * ROW_H + ROW_H / 2
                      const y2 = si * ROW_H + ROW_H / 2
                      const xe = x1 + 8
                      const backward = x2 - 8 < xe
                      const ym = y1 + (y2 > y1 ? ROW_H / 2 : -ROW_H / 2)
                      const path = backward
                        ? `M${x1},${y1} H${xe} V${ym} H${x2 - 10} V${y2} H${x2 - 1}`
                        : `M${x1},${y1} H${xe} V${y2} H${x2 - 1}`
                      return (
                        <path
                          key={d.id}
                          d={path}
                          fill="none"
                          stroke="#526173"
                          strokeWidth={1.25}
                          strokeDasharray={backward ? '4 3' : undefined}
                          markerEnd={`url(#${markerId})`}
                        />
                      )
                    })}
                  </svg>

                  {rows.map((row, i) =>
                    row.type === 'phase' ? (
                      <div key={row.key} className="absolute inset-x-0 border-b border-[#E4E9EF] bg-[#F7F9FB]/60" style={{ top: i * ROW_H, height: ROW_H }}>
                        {row.span && (
                          <div
                            aria-hidden="true"
                            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-sm"
                            style={{ left: x(row.span.start), width: Math.max(6, (row.span.end - row.span.start + 1) * px), backgroundColor: row.style.accent }}
                          >
                            <span className="absolute left-0 top-full h-1.5 w-1 rounded-b-sm" style={{ backgroundColor: row.style.accent }} />
                            <span className="absolute right-0 top-full h-1.5 w-1 rounded-b-sm" style={{ backgroundColor: row.style.accent }} />
                          </div>
                        )}
                      </div>
                    ) : (
                      <BarRow
                        key={row.activity.id}
                        row={row}
                        top={i * ROW_H}
                        x={x}
                        px={px}
                        today={today}
                        conflict={conflictIds.has(row.activity.id)}
                        selected={selectedId === row.activity.id}
                        hiddenPreds={deps.hiddenPreds.get(row.activity.id) ?? 0}
                        baseline={baselineOn ? baselineSpan(baseline, row.activity.id) : null}
                        descriptionId={`${uid}-d-${row.activity.id}`}
                        onClick={(e) => select(e, row.activity)}
                        onEnter={() => showPeek(row.activity, row.placement)}
                        onLeave={() => setPeek(null)}
                      />
                    ),
                  )}

                  {peek && peekActivity && peekRow !== undefined && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute z-30 w-72 rounded-lg border border-[#D6DDE5] bg-white p-3 text-xs shadow-lg"
                      style={
                        peekRow < rows.length - 3 || rows.length < 5
                          ? { left: peek.left, top: (peekRow + 1) * ROW_H + 4 }
                          : { left: peek.left, bottom: (rows.length - peekRow) * ROW_H + 4 }
                      }
                    >
                      <PeekCard
                        activity={peekActivity}
                        placement={placements.get(peekActivity.id) as Placed}
                        assignee={nameFor(peekActivity.assigned_to)}
                        subs={subsFor(peekActivity.id).map((s) => s.company_name)}
                        preds={deps.preds.get(peekActivity.id) ?? []}
                        succs={deps.succs.get(peekActivity.id) ?? []}
                        hiddenPreds={deps.hiddenPreds.get(peekActivity.id) ?? 0}
                        hiddenSuccs={deps.hiddenSuccs.get(peekActivity.id) ?? 0}
                        overdue={isOverdue(peekActivity, today)}
                        conflict={conflictIds.has(peekActivity.id)}
                        baselineText={
                          baseline
                            ? (() => {
                                const b = baselineSpan(baseline, peekActivity.id)
                                return b ? `v${baseline.version}: ${datesText({ kind: 'bar', start: b.start, end: b.end })}` : `Not in v${baseline.version}`
                              })()
                            : null
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#D6DDE5] bg-[#F7F9FB] px-4 py-2 text-xs text-[#526173]">
            {legendPhases.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: p.style.accent }} />
                {p.phase}
              </span>
            ))}
            <span className="hidden h-3 w-px bg-[#D6DDE5] sm:block" aria-hidden="true" />
            <LegendItem swatch={<span className="size-2.5 rotate-45 rounded-[1px] border-2 border-[#526173] bg-white" />} label="Milestone" />
            <LegendItem swatch={<span className="h-3 w-0.5 bg-interactive" />} label="Today" />
            <LegendItem swatch={<span className="h-2.5 w-5 rounded-sm ring-2 ring-destructive" />} label="Past due" />
            <details className="group relative">
              <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md px-1.5 font-medium text-interactive-strong hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive [&::-webkit-details-marker]:hidden">
                Legend
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
              </summary>
              <div className="absolute bottom-full left-0 z-30 mb-2 flex w-64 flex-col gap-2 rounded-lg border border-[#D6DDE5] bg-white p-3 shadow-lg">
                <LegendItem
                  swatch={
                    <span className="flex h-2.5 w-5 overflow-hidden rounded-sm border border-[#526173] bg-[#E9EDF2]">
                      <span className="w-1/2 bg-[#526173]" />
                    </span>
                  }
                  label="Progress (filled portion of a bar)"
                />
                <LegendItem swatch={<span className="h-1.5 w-5 rounded-sm bg-[#526173]" />} label="Phase span" />
                {baselineOn && <LegendItem swatch={<span className="h-1.5 w-5 rounded-sm bg-[#8B97A6]" />} label={`Baseline v${baseline!.version}`} />}
                {weekendShade && <LegendItem swatch={<span className="h-3 w-3 rounded-sm bg-[#17212B]/10" />} label="Weekend" />}
                <LegendItem swatch={<span className="h-2.5 w-5 rounded-sm outline-2 outline-dashed outline-warning" />} label="Date conflict" />
                <LegendItem swatch={<CornerDownRight className="size-3.5" aria-hidden="true" />} label="Predecessor not shown" />
                <LegendItem swatch={<span className="h-0 w-5 border-t border-dashed border-[#526173]" />} label="Dependency drawn backward" />
              </div>
            </details>
            {deps.offChart > 0 && (
              <details className="group basis-full sm:ml-auto sm:basis-auto">
                <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive [&::-webkit-details-marker]:hidden">
                  <Link2 className="size-3.5" aria-hidden="true" />
                  {`${deps.offChart} ${deps.offChart === 1 ? 'dependency' : 'dependencies'} outside this view`}
                  <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="mt-1.5 flex max-w-md flex-col gap-1.5 px-1.5 pb-1">
                  <p>Dependencies are drawn only when both activities are on the chart. This is expected and isn&apos;t an error.</p>
                  <ul className="flex flex-col gap-0.5">
                    {deps.offReasons.filtered > 0 && <li>{`${deps.offReasons.filtered} involve activities hidden by filters`}</li>}
                    {deps.offReasons.collapsed > 0 && <li>{`${deps.offReasons.collapsed} involve activities in collapsed phases`}</li>}
                    {deps.offReasons.undated > 0 && <li>{`${deps.offReasons.undated} involve activities missing dates`}</li>}
                  </ul>
                  <p>Hover or focus an activity to see its predecessors and successors.</p>
                </div>
              </details>
            )}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <section aria-labelledby={`${uid}-unscheduled`} className="rounded-xl border border-[#D6DDE5] bg-white">
          <h3 id={`${uid}-unscheduled`} className="m-0">
            <button
              type="button"
              aria-expanded={unscheduledOpen}
              aria-controls={`${uid}-unscheduled-body`}
              onClick={() => setUnscheduledOpen((v) => !v)}
              className="flex min-h-11 w-full items-center gap-2 rounded-xl px-4 py-2 text-left hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-interactive"
            >
              <ChevronDown className={cn('size-4 shrink-0 text-[#526173] transition-transform motion-reduce:transition-none', !unscheduledOpen && '-rotate-90')} aria-hidden="true" />
              <span className="text-sm font-semibold text-[#17212B]">{`Unscheduled (${unscheduled.length})`}</span>
              <span className="hidden truncate text-xs font-normal text-[#526173] sm:inline">Not drawn until planned dates are complete and valid</span>
            </button>
          </h3>
          <div id={`${uid}-unscheduled-body`} hidden={!unscheduledOpen} className="border-t border-[#E4E9EF]">
          <ul id={`${uid}-unscheduled-list`} className="divide-y divide-[#E4E9EF]">
            {(showAllUnscheduled ? unscheduled : unscheduled.slice(0, UNSCHEDULED_PREVIEW)).map((a) => {
              const p = placements.get(a.id)!
              const reason = p.kind === 'incomplete' ? p.reason : 'undated'
              const known = [a.planned_start && `Start ${formatDate(a.planned_start)}`, a.planned_end && `Finish ${formatDate(a.planned_end)}`].filter(Boolean).join(' · ')
              const problem = reason === 'invalid_range' || reason === 'invalid_date'
              return (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: stageStyle(a.phase).accent }} aria-hidden="true" />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-[#17212B]">{a.name}</span>
                      <span className="text-xs text-[#526173]">
                        {a.phase}
                        {' · '}
                        <span className={cn(problem && 'font-medium text-warning-foreground')}>{INCOMPLETE_LABELS[reason]}</span>
                        {known && ` · ${known}`}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="min-h-11 shrink-0 sm:min-h-8" onClick={() => onSelect(a)}>
                    {canManage ? 'Set dates' : 'View'}
                  </Button>
                </li>
              )
            })}
          </ul>
          {unscheduled.length > UNSCHEDULED_PREVIEW && (
            <div className="flex justify-center border-t border-[#E4E9EF] px-4 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 sm:min-h-8"
                aria-expanded={showAllUnscheduled}
                aria-controls={`${uid}-unscheduled-list`}
                onClick={() => setShowAllUnscheduled((v) => !v)}
              >
                {showAllUnscheduled ? 'Show less' : `Show all (${unscheduled.length})`}
                <ChevronDown
                  className={cn('size-4 transition-transform motion-reduce:transition-none', showAllUnscheduled && 'rotate-180')}
                  aria-hidden="true"
                />
              </Button>
            </div>
          )}
          </div>
        </section>
      )}
    </section>
  )
}

function LegendItem({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex w-5 shrink-0 items-center justify-center" aria-hidden="true">
        {swatch}
      </span>
      {label}
    </span>
  )
}

function FilterSelect({
  id,
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  allLabel: string
  value: string | null
  options: { value: string; label: string }[]
  onChange: (value: string | null) => void
}) {
  return (
    <div className="relative w-[calc(50%-0.25rem)] sm:w-auto">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          'h-11 w-full min-w-0 appearance-none rounded-lg border bg-white pl-3 pr-8 text-sm text-[#17212B] shadow-xs hover:border-[#B9C3CF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive/50 sm:h-9 sm:w-44',
          value ? 'border-interactive-border font-medium' : 'border-[#D6DDE5]',
        )}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-[#526173]" aria-hidden="true" />
    </div>
  )
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className={cn('inline-flex min-h-8 items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium', pillClass(true))}>
      <span className="max-w-48 truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label={`Remove filter ${label}`} className="flex size-6 items-center justify-center rounded-full hover:bg-white/20">
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}

function NameCell({
  row,
  today,
  conflict,
  selected,
  descriptionId,
  description,
  onClick,
  onFocus,
  onBlur,
}: {
  row: Extract<Row, { type: 'activity' }>
  today: string
  conflict: boolean
  selected: boolean
  descriptionId: string
  description: string
  onClick: (e: MouseEvent) => void
  onFocus: (e: FocusEvent<HTMLButtonElement>) => void
  onBlur: () => void
}) {
  const a = row.activity
  const overdue = isOverdue(a, today)
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-describedby={descriptionId}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full flex-col justify-center gap-0.5 border-b border-l-[3px] border-b-[#E4E9EF] pl-5 pr-2.5 text-left hover:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-interactive',
          selected && 'bg-interactive-soft',
        )}
        style={{ height: ROW_H, borderLeftColor: row.style.accent }}
      >
        <span className={cn('truncate text-sm font-medium text-[#17212B]', a.status === 'skipped' && 'text-[#526173] line-through')} title={a.name}>
          {a.name}
        </span>
        <span className="flex items-center gap-1.5 truncate text-xs text-[#526173]">
          {overdue ? (
            <span className="inline-flex items-center gap-1 font-medium text-destructive">
              <AlertTriangle className="size-3" aria-hidden="true" />
              Past due
            </span>
          ) : (
            <span>{ACTIVITY_STATUS_LABELS[a.status]}</span>
          )}
          {a.activity_type !== 'milestone' && <span className="tabular-nums">{`· ${Math.round(Number(a.percent_complete))}%`}</span>}
          {conflict && (
            <span className="inline-flex items-center gap-0.5 text-warning-foreground">
              <Link2 className="size-3" aria-hidden="true" />
              Conflict
            </span>
          )}
        </span>
      </button>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
    </>
  )
}

function BarRow({
  row,
  top,
  x,
  px,
  today,
  conflict,
  selected,
  hiddenPreds,
  baseline,
  descriptionId,
  onClick,
  onEnter,
  onLeave,
}: {
  row: Extract<Row, { type: 'activity' }>
  top: number
  x: (day: number) => number
  px: number
  today: string
  conflict: boolean
  selected: boolean
  hiddenPreds: number
  baseline: { start: number; end: number } | null
  descriptionId: string
  onClick: (e: MouseEvent) => void
  onEnter: () => void
  onLeave: () => void
}) {
  const a = row.activity
  const p = row.placement
  const overdue = isOverdue(a, today)
  const accent = row.style.accent
  const pct = a.status === 'completed' ? 100 : Math.max(0, Math.min(100, Number(a.percent_complete)))
  const start = p.kind === 'bar' ? x(p.start) : x(p.day) + px / 2 - 7
  const width = p.kind === 'bar' ? Math.max(6, (p.end - p.start + 1) * px) : 14
  const common = {
    type: 'button' as const,
    tabIndex: -1,
    onClick,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    'aria-label': a.name,
    'aria-describedby': descriptionId,
  }
  return (
    <div className={cn('absolute inset-x-0 border-b border-[#E4E9EF]', selected && 'bg-interactive-soft/50')} style={{ top, height: ROW_H }}>
      {baseline && (
        <span
          aria-hidden="true"
          className="absolute h-1.5 rounded-sm bg-[#8B97A6]"
          style={{ top: 35, left: x(baseline.start), width: Math.max(4, (baseline.end - baseline.start + 1) * px) }}
        />
      )}
      {hiddenPreds > 0 && (
        <span
          aria-hidden="true"
          title={`${hiddenPreds} predecessor${hiddenPreds === 1 ? '' : 's'} not shown`}
          className="absolute top-1/2 z-[2] flex size-4 -translate-y-1/2 items-center justify-center rounded-full border border-[#C7D0DA] bg-white text-[#526173]"
          style={{ left: start - 20 }}
        >
          <CornerDownRight className="size-3" />
        </span>
      )}
      {p.kind === 'milestone' ? (
        <button
          {...common}
          className={cn(
            'absolute top-1/2 z-[2] size-3.5 -translate-y-1/2 rotate-45 rounded-[2px] border-2 focus-visible:outline-none',
            overdue && 'ring-2 ring-destructive ring-offset-1',
            !overdue && selected && 'ring-2 ring-interactive ring-offset-2',
          )}
          style={{ left: start, borderColor: accent, backgroundColor: a.status === 'completed' ? accent : '#FFFFFF' }}
        />
      ) : (
        <button
          {...common}
          className={cn(
            'absolute top-1/2 z-[2] h-5 -translate-y-1/2 overflow-hidden rounded-[5px] border focus-visible:outline-none',
            a.status === 'skipped' && 'opacity-50',
            overdue && 'ring-2 ring-destructive ring-offset-1',
            !overdue && selected && 'ring-2 ring-interactive ring-offset-2',
            conflict && 'outline-2 outline-offset-2 outline-dashed outline-warning',
          )}
          style={{ left: start, width, borderColor: accent, backgroundColor: row.style.background }}
        >
          <span className="block h-full" style={{ width: `${pct}%`, backgroundColor: accent }} />
        </button>
      )}
    </div>
  )
}

function PeekCard({
  activity: a,
  placement,
  assignee,
  subs,
  preds,
  succs,
  hiddenPreds,
  hiddenSuccs,
  overdue,
  conflict,
  baselineText,
}: {
  baselineText: string | null
  activity: ScheduleActivity
  placement: Placed
  assignee: string | null
  subs: string[]
  preds: string[]
  succs: string[]
  hiddenPreds: number
  hiddenSuccs: number
  overdue: boolean
  conflict: boolean
}) {
  const style = stageStyle(a.phase)
  const actual = [a.actual_start && `Started ${formatDate(a.actual_start)}`, a.actual_end && `Finished ${formatDate(a.actual_end)}`].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[#17212B]">{a.name}</span>
        <span className="flex items-center gap-1.5 text-[#526173]">
          <span className="size-2 rounded-full" style={{ backgroundColor: style.accent }} aria-hidden="true" />
          {a.phase}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ActivityStatusBadge status={a.status} />
        {a.activity_type !== 'milestone' && <span className="tabular-nums text-[#526173]">{`${Math.round(Number(a.percent_complete))}% complete`}</span>}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[#17212B]">
        <dt className="text-[#526173]">{placement.kind === 'milestone' ? 'Date' : 'Planned'}</dt>
        <dd>{datesText(placement)}</dd>
        {baselineText && (
          <>
            <dt className="text-[#526173]">Baseline</dt>
            <dd>{baselineText}</dd>
          </>
        )}
        {actual && (
          <>
            <dt className="text-[#526173]">Actual</dt>
            <dd>{actual}</dd>
          </>
        )}
        {assignee && (
          <>
            <dt className="text-[#526173]">Assigned</dt>
            <dd>{assignee}</dd>
          </>
        )}
        {subs.length > 0 && (
          <>
            <dt className="text-[#526173]">Subs</dt>
            <dd>{subs.join(', ')}</dd>
          </>
        )}
        {preds.length > 0 && (
          <>
            <dt className="text-[#526173]">After</dt>
            <dd>{`${preds.join(', ')} (finish-to-start)`}</dd>
          </>
        )}
        {succs.length > 0 && (
          <>
            <dt className="text-[#526173]">Before</dt>
            <dd>{succs.join(', ')}</dd>
          </>
        )}
      </dl>
      {(hiddenPreds > 0 || hiddenSuccs > 0) && (
        <p className="text-[#526173]">
          {[
            hiddenPreds > 0 && `${hiddenPreds} predecessor${hiddenPreds === 1 ? '' : 's'}`,
            hiddenSuccs > 0 && `${hiddenSuccs} successor${hiddenSuccs === 1 ? '' : 's'}`,
          ]
            .filter(Boolean)
            .join(' and ')}{' '}
          not shown in the chart.
        </p>
      )}
      {overdue && <p className="font-medium text-destructive">Past its planned finish and not complete.</p>}
      {conflict && <p className="font-medium text-warning-foreground">Planned to start before a predecessor finishes.</p>}
    </div>
  )
}
