import { formatDate } from './format.ts'
import type { StageActivities } from './stage-activities.ts'

/**
 * The due date of the exact record shown as a Priority Job's "Next step".
 * - `none`: no applicable next-step record (no stage schedule, empty, complete, unavailable).
 * - `unscheduled`: a next-step record exists but carries no date.
 * - `dated`: that record's own date. `overdue` is only ever the record's existing overdue flag.
 */
export type NextStepDue =
  | { kind: 'none' }
  | { kind: 'unscheduled'; activityId: string | null }
  | { kind: 'dated'; dueOn: string; overdue: boolean; activityId: string | null }

export function nextStepDue(input: {
  closeoutReason?: string | null
  closeoutDueOn?: string | null
  stageActivities: StageActivities | null
}): NextStepDue {
  if (input.closeoutReason) {
    return input.closeoutDueOn
      ? { kind: 'dated', dueOn: input.closeoutDueOn, overdue: false, activityId: null }
      : { kind: 'unscheduled', activityId: null }
  }
  const data = input.stageActivities
  if (!data || (data.state !== 'next' && data.state !== 'blocked')) return { kind: 'none' }
  const { activity } = data
  return activity.dueOn
    ? { kind: 'dated', dueOn: activity.dueOn, overdue: activity.overdue, activityId: activity.id }
    : { kind: 'unscheduled', activityId: activity.id }
}

/** "Today" for the organization's current date; otherwise a compact date, with the year only when it differs from today's. */
export function dueDateLabel(dueOn: string, today: string): { text: string; isToday: boolean } {
  const day = dueOn.slice(0, 10)
  if (day === today) return { text: 'Today', isToday: true }
  const full = formatDate(day)
  return { text: day.slice(0, 4) === today.slice(0, 4) ? full.replace(/,\s*\d{4}$/, '') : full, isToday: false }
}
