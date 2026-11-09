import type { NextStepDue } from './next-step-due.ts'

/** Due soon covers tomorrow through this many calendar days ahead, inclusive. */
export const DUE_SOON_DAYS = 10
/** Rows shown per group before "Showing X of Y". */
export const DUE_GROUP_LIMIT = 5

export const DUE_GROUP_IDS = ['overdue', 'today', 'soon', 'unscheduled'] as const
export type DueGroupId = (typeof DUE_GROUP_IDS)[number]

export function isDueGroupId(value: unknown): value is DueGroupId {
  return typeof value === 'string' && (DUE_GROUP_IDS as readonly string[]).includes(value)
}

export function addCalendarDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Group for one project's next step, by that record's own calendar date against the workspace's `today` (YYYY-MM-DD).
 * `later` is beyond the Due soon window and is left out of the card.
 */
export function dueGroupFor(due: NextStepDue, today: string): DueGroupId | 'later' {
  if (due.kind !== 'dated') return 'unscheduled'
  const day = due.dueOn.slice(0, 10)
  if (day < today) return 'overdue'
  if (day === today) return 'today'
  return day <= addCalendarDays(today, DUE_SOON_DAYS) ? 'soon' : 'later'
}

export type DueGroup = { id: DueGroupId; ids: string[] }

/**
 * One entry per project, grouped by when its next step is due. Dated groups run oldest date first; ties and
 * Not scheduled keep `rankOrder` (the existing risk ranking). Projects missing from `rankOrder` sort last.
 */
export function groupByDue(
  items: { id: string; due: NextStepDue }[],
  rankOrder: readonly string[],
  today: string,
): { groups: DueGroup[]; laterCount: number } {
  const position = new Map(rankOrder.map((id, i) => [id, i]))
  const rank = (id: string) => position.get(id) ?? Number.MAX_SAFE_INTEGER
  const buckets = new Map<DueGroupId, { id: string; day: string }[]>(DUE_GROUP_IDS.map((g) => [g, []]))
  const seen = new Set<string>()
  let laterCount = 0
  for (const item of items) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const group = dueGroupFor(item.due, today)
    if (group === 'later') laterCount++
    else buckets.get(group)!.push({ id: item.id, day: item.due.kind === 'dated' ? item.due.dueOn.slice(0, 10) : '' })
  }
  const groups = DUE_GROUP_IDS.map((id) => ({
    id,
    ids: buckets
      .get(id)!
      .sort((a, b) => (a.day === b.day ? rank(a.id) - rank(b.id) : a.day < b.day ? -1 : 1))
      .map((e) => e.id),
  }))
  return { groups, laterCount }
}
