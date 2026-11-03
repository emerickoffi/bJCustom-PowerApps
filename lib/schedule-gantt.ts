import type { ActivityStatus, ScheduleActivity, ScheduleDependency } from './schedule.ts'

/**
 * Pure helpers for the schedule Gantt. Dates are calendar days counted from the Unix epoch in UTC,
 * so a saved YYYY-MM-DD value is never shifted by the browser's or server's timezone.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function dayNumber(iso: string | null | undefined): number | null {
  if (!iso) return null
  const match = ISO_DATE.exec(iso)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const time = Date.UTC(y, m - 1, d)
  const check = new Date(time)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
  return time / DAY_MS
}

export function isoFromDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

function dateOf(day: number) {
  return new Date(day * DAY_MS)
}

export type IncompleteReason = 'undated' | 'missing_start' | 'missing_finish' | 'invalid_range' | 'invalid_date'

export type Placement =
  | { kind: 'bar'; start: number; end: number }
  | { kind: 'milestone'; day: number }
  | { kind: 'incomplete'; reason: IncompleteReason }

export const INCOMPLETE_LABELS: Record<IncompleteReason, string> = {
  undated: 'No planned dates',
  missing_start: 'Start date missing',
  missing_finish: 'Finish date missing',
  invalid_range: 'Finish is before start',
  invalid_date: 'Unreadable saved date',
}

/**
 * Where an activity can honestly be drawn. Bars need both planned dates (finish inclusive);
 * milestones are a single point and may use whichever planned date is saved. Nothing is inferred.
 */
export function placeActivity(a: Pick<ScheduleActivity, 'activity_type' | 'planned_start' | 'planned_end'>): Placement {
  const hasStart = !!a.planned_start
  const hasEnd = !!a.planned_end
  if (!hasStart && !hasEnd) return { kind: 'incomplete', reason: 'undated' }
  const start = dayNumber(a.planned_start)
  const end = dayNumber(a.planned_end)
  if ((hasStart && start === null) || (hasEnd && end === null)) return { kind: 'incomplete', reason: 'invalid_date' }
  if (start !== null && end !== null && end < start) return { kind: 'incomplete', reason: 'invalid_range' }
  if (a.activity_type === 'milestone') return { kind: 'milestone', day: (end ?? start) as number }
  if (start === null) return { kind: 'incomplete', reason: 'missing_start' }
  if (end === null) return { kind: 'incomplete', reason: 'missing_finish' }
  return { kind: 'bar', start, end }
}

export function placementStart(p: Placement): number | null {
  return p.kind === 'bar' ? p.start : p.kind === 'milestone' ? p.day : null
}

export function placementEnd(p: Placement): number | null {
  return p.kind === 'bar' ? p.end : p.kind === 'milestone' ? p.day : null
}

/** Display-only phase span from the valid child placements. Never saved. */
export function phaseSpan(placements: Placement[]): { start: number; end: number } | null {
  let start = Infinity
  let end = -Infinity
  for (const p of placements) {
    const s = placementStart(p)
    const e = placementEnd(p)
    if (s === null || e === null) continue
    start = Math.min(start, s)
    end = Math.max(end, e)
  }
  return Number.isFinite(start) ? { start, end } : null
}

/** Dependency ids whose edges belong to a cycle (including self-references). Tarjan's SCC. */
export function cycleDependencyIds(deps: ScheduleDependency[]): Set<string> {
  const adjacency = new Map<string, string[]>()
  for (const d of deps) {
    adjacency.set(d.predecessor_id, [...(adjacency.get(d.predecessor_id) ?? []), d.successor_id])
    if (!adjacency.has(d.successor_id)) adjacency.set(d.successor_id, [])
  }
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const component = new Map<string, number>()
  const componentSize = new Map<number, number>()
  let counter = 0
  let componentId = 0

  const visit = (node: string) => {
    index.set(node, counter)
    low.set(node, counter)
    counter += 1
    stack.push(node)
    onStack.add(node)
    for (const next of adjacency.get(node) ?? []) {
      if (!index.has(next)) {
        visit(next)
        low.set(node, Math.min(low.get(node)!, low.get(next)!))
      } else if (onStack.has(next)) {
        low.set(node, Math.min(low.get(node)!, index.get(next)!))
      }
    }
    if (low.get(node) === index.get(node)) {
      let size = 0
      let member: string | undefined
      do {
        member = stack.pop()!
        onStack.delete(member)
        component.set(member, componentId)
        size += 1
      } while (member !== node)
      componentSize.set(componentId, size)
      componentId += 1
    }
  }
  for (const node of adjacency.keys()) if (!index.has(node)) visit(node)

  const result = new Set<string>()
  for (const d of deps) {
    const c = component.get(d.predecessor_id)
    if (d.predecessor_id === d.successor_id || (c !== undefined && c === component.get(d.successor_id) && (componentSize.get(c) ?? 0) > 1)) {
      result.add(d.id)
    }
  }
  return result
}

export type DependencyState = 'drawn' | 'hidden_predecessor' | 'hidden_successor' | 'hidden' | 'missing' | 'cycle'

/**
 * Classifies saved dependencies against what the chart shows. Only "drawn" edges get a connector;
 * anything pointing outside the visible rows is reported instead of drawn.
 */
export function analyzeDependencies(
  deps: ScheduleDependency[],
  activityIds: Set<string>,
  visibleIds: Set<string>,
): { dep: ScheduleDependency; state: DependencyState }[] {
  const cycles = cycleDependencyIds(deps)
  return deps.map((dep) => {
    if (!activityIds.has(dep.predecessor_id) || !activityIds.has(dep.successor_id)) return { dep, state: 'missing' }
    if (cycles.has(dep.id)) return { dep, state: 'cycle' }
    const predVisible = visibleIds.has(dep.predecessor_id)
    const succVisible = visibleIds.has(dep.successor_id)
    if (predVisible && succVisible) return { dep, state: 'drawn' }
    if (succVisible) return { dep, state: 'hidden_predecessor' }
    if (predVisible) return { dep, state: 'hidden_successor' }
    return { dep, state: 'hidden' }
  })
}

export const ZOOM_PX = { day: 36, week: 14, month: 4 } as const
export type Zoom = keyof typeof ZOOM_PX
export const ZOOMS: Zoom[] = ['day', 'week', 'month']

/** Chart range in days: every placed activity plus today, padded so edges aren't flush. */
export function chartRange(days: number[], today: number): { start: number; end: number } {
  if (!days.length) return { start: today - 14, end: today + 60 }
  return { start: Math.min(...days, today) - 14, end: Math.max(...days, today) + 35 }
}

/** The most detailed zoom at which `spanDays` fits inside `widthPx`. */
export function fitZoom(spanDays: number, widthPx: number): Zoom {
  for (const z of ZOOMS) if (spanDays * ZOOM_PX[z] <= widthPx) return z
  return 'month'
}

export type Tick = { day: number; label: string }

/** Header labels: `major` is the upper band (months or years), `minor` the lower (days, weeks, months). */
export function headerTicks(start: number, end: number, zoom: Zoom): { major: Tick[]; minor: Tick[] } {
  const major: Tick[] = []
  const minor: Tick[] = []
  for (let day = start; day <= end; day++) {
    const d = dateOf(day)
    const date = d.getUTCDate()
    const month = d.getUTCMonth()
    const year = d.getUTCFullYear()
    if (zoom === 'month') {
      if (date === 1) minor.push({ day, label: MONTHS[month] })
      if ((date === 1 && month === 0) || day === start) major.push({ day, label: String(year) })
    } else {
      if (date === 1 || day === start) major.push({ day, label: `${MONTHS[month]} ${year}` })
      if (zoom === 'day') minor.push({ day, label: String(date) })
      else if (d.getUTCDay() === 1) minor.push({ day, label: `${MONTHS[month]} ${date}` })
    }
  }
  return { major, minor }
}

/** Offset (0–6) from `start` to the first Saturday, used to shade weekends with a repeating gradient. */
export function firstSaturdayOffset(start: number): number {
  return (6 - dateOf(start).getUTCDay() + 7) % 7
}

export function spanLabel(start: number, end: number): string {
  const days = end - start + 1
  return `${days} ${days === 1 ? 'day' : 'days'}`
}

export type GanttFilters = {
  search: string
  phase: string | null
  status: ActivityStatus | null
  assignee: string | null
  company: string | null
}

export const EMPTY_FILTERS: GanttFilters = { search: '', phase: null, status: null, assignee: null, company: null }

export function hasActiveFilters(f: GanttFilters): boolean {
  return !!f.search.trim() || !!f.phase || !!f.status || !!f.assignee || !!f.company
}

export function matchesFilters(
  a: Pick<ScheduleActivity, 'id' | 'name' | 'phase' | 'status' | 'assigned_to'>,
  f: GanttFilters,
  companiesFor: (activityId: string) => string[],
): boolean {
  const q = f.search.trim().toLowerCase()
  if (q && !a.name.toLowerCase().includes(q) && !a.phase.toLowerCase().includes(q)) return false
  if (f.phase && a.phase !== f.phase) return false
  if (f.status && a.status !== f.status) return false
  if (f.assignee && a.assigned_to !== f.assignee) return false
  if (f.company && !companiesFor(a.id).includes(f.company)) return false
  return true
}
