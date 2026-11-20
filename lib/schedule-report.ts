/**
 * Company schedule report: what's behind and what's coming up across every active job. Pure, so node --test can load it.
 * "Late" uses the same rule as the rest of Trefort: delayed, or past its planned finish and not done.
 */
import { addDaysIso, daysBetween } from './warranty-coverage.ts'

export type ReportActivity = {
  id: string
  project_id: string
  project_name: string
  name: string
  phase: string
  activity_type: string
  status: string
  planned_start: string | null
  planned_end: string | null
  percent_complete: number
  delay_reason: string | null
  /** Staff member and subcontractor companies doing the work. */
  who: string[]
}

export type LateItem = ReportActivity & { daysLate: number | null }
export type WeekGroup = { start: string; label: string; items: ReportActivity[] }
export type ScheduleReport = { late: LateItem[]; weeks: WeekGroup[]; lookaheadWeeks: number; today: string }

export const LOOKAHEAD_OPTIONS = [2, 3, 4] as const
export type LookaheadWeeks = (typeof LOOKAHEAD_OPTIONS)[number]

const isOpen = (a: { status: string }) => a.status !== 'completed' && a.status !== 'skipped'

export function isLate(a: Pick<ReportActivity, 'status' | 'planned_end'>, today: string): boolean {
  return isOpen(a) && (a.status === 'delayed' || (!!a.planned_end && a.planned_end < today))
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return addDaysIso(iso, day === 0 ? -6 : 1 - day)
}

function weekLabel(start: string, thisWeek: string): string {
  const diff = daysBetween(thisWeek, start) / 7
  if (diff === 0) return 'This week'
  if (diff === 1) return 'Next week'
  const d = new Date(`${start}T00:00:00Z`)
  return `Week of ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`
}

/**
 * Late: open and delayed or past finish, most days late first.
 * Coming up: open, not late, and starting within the look-ahead (or already started and finishing within it),
 * grouped by the week it starts (work already under way goes in This week).
 */
export function buildScheduleReport(activities: ReportActivity[], today: string, lookaheadWeeks: number): ScheduleReport {
  const thisWeek = weekStart(today)
  const horizon = addDaysIso(thisWeek, lookaheadWeeks * 7 - 1)

  const late: LateItem[] = activities
    .filter((a) => isLate(a, today))
    .map((a) => ({ ...a, daysLate: a.planned_end && a.planned_end < today ? daysBetween(a.planned_end, today) : null }))
    .sort((x, y) => (y.daysLate ?? -1) - (x.daysLate ?? -1) || x.project_name.localeCompare(y.project_name) || x.name.localeCompare(y.name))

  const groups = new Map<string, ReportActivity[]>()
  for (const a of activities) {
    if (!isOpen(a) || isLate(a, today)) continue
    const start = a.planned_start ?? a.planned_end
    if (!start) continue
    const startsInWindow = start >= today && start <= horizon
    const underWay = start < today && !!a.planned_end && a.planned_end >= today && a.planned_end <= horizon
    if (!startsInWindow && !underWay) continue
    const key = underWay ? thisWeek : weekStart(start)
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  const weeks: WeekGroup[] = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, items]) => ({
      start,
      label: weekLabel(start, thisWeek),
      items: items.sort(
        (x, y) =>
          (x.planned_start ?? x.planned_end ?? '').localeCompare(y.planned_start ?? y.planned_end ?? '') ||
          x.project_name.localeCompare(y.project_name),
      ),
    }))

  return { late, weeks, lookaheadWeeks, today }
}

export function parseLookahead(raw: string | null | undefined): LookaheadWeeks {
  const n = Number(raw)
  return (LOOKAHEAD_OPTIONS as readonly number[]).includes(n) ? (n as LookaheadWeeks) : 2
}
