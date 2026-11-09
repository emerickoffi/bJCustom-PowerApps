import { isOverdue, type ScheduleActivity } from './schedule.ts'

export type ScheduleFilter = 'all' | 'unscheduled' | 'in_progress' | 'overdue' | 'upcoming'

export const SCHEDULE_FILTERS: readonly ScheduleFilter[] = ['all', 'unscheduled', 'in_progress', 'overdue', 'upcoming']

export const UPCOMING_DAYS = 14

export function addDaysIso(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const isOpen = (a: Pick<ScheduleActivity, 'status'>) => a.status !== 'completed' && a.status !== 'skipped'

/**
 * Every filter an activity matches. Filters overlap on purpose (an in-progress activity can also be overdue);
 * nothing here changes stored statuses. Undated activities are never overdue because `isOverdue` needs a
 * planned finish.
 */
export function classifyActivity(
  a: Pick<ScheduleActivity, 'status' | 'planned_start' | 'planned_end'>,
  today: string,
  horizon: string,
): ScheduleFilter[] {
  const matches: ScheduleFilter[] = ['all']
  if (!a.planned_start && !a.planned_end) matches.push('unscheduled')
  if (a.status === 'in_progress') matches.push('in_progress')
  if (isOverdue(a, today)) matches.push('overdue')
  if (isOpen(a) && [a.planned_start, a.planned_end].some((d) => d && d >= today && d <= horizon)) matches.push('upcoming')
  return matches
}
