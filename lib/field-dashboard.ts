import type { ActionItem } from './action-items.ts'

export type UpcomingWorkItem = {
  key: string
  kind: 'activity' | 'punch'
  title: string
  /** YYYY-MM-DD taken from the source record. */
  date: string
  dateLabel: 'Starts' | 'Due' | 'Finishes'
  overdue: boolean
  href: string
}

type ActivityRow = { id: string; name: string; status: string; planned_start: string | null; planned_end: string | null }
type IssueRow = { id: string; item_label: string | null; category: string | null; due_date: string | null; status: string }

/**
 * Merges dated schedule activities and punch-list deadlines for one job. Only real dates from the records are
 * used: an activity without planned dates or a punch item without a due date is never shown.
 */
export function buildUpcomingWork(input: {
  projectId: string
  activities: ActivityRow[]
  issues: IssueRow[]
  today: string
  limit: number
}): UpcomingWorkItem[] {
  const { projectId, activities, issues, today, limit } = input
  const base = `/projects/${encodeURIComponent(projectId)}`
  const items: UpcomingWorkItem[] = []

  for (const a of activities) {
    if (a.status === 'completed' || a.status === 'skipped') continue
    const startsLater = a.planned_start && a.planned_start >= today
    const date = startsLater ? a.planned_start : a.planned_end
    if (!date) continue
    items.push({
      key: `activity:${a.id}`,
      kind: 'activity',
      title: a.name,
      date,
      dateLabel: startsLater ? 'Starts' : 'Finishes',
      overdue: !startsLater && date < today,
      href: `${base}/schedule`,
    })
  }
  for (const i of issues) {
    if (!i.due_date || i.status === 'closed' || i.status === 'resolved') continue
    items.push({
      key: `punch:${i.id}`,
      kind: 'punch',
      title: i.item_label?.trim() || i.category?.trim() || 'Punch item',
      date: i.due_date,
      dateLabel: 'Due',
      overdue: i.due_date < today,
      href: `${base}/issues/${encodeURIComponent(i.id)}`,
    })
  }

  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)).slice(0, limit)
}

/** The one action to feature. Action Center items are already ranked (severity, tier, due date). */
export function pickFocus(items: ActionItem[]): ActionItem | null {
  return items[0] ?? null
}

export function isOverdueItem(item: Pick<ActionItem, 'dueDate'>, today: string): boolean {
  return Boolean(item.dueDate && item.dueDate < today)
}
