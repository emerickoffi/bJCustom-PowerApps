export const ACTIVITY_STATUSES = ['not_started', 'in_progress', 'completed', 'delayed', 'on_hold', 'skipped'] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  on_hold: 'On hold',
  skipped: 'Not applicable',
}

export const ACTIVITY_TYPES = ['task', 'milestone', 'inspection', 'meeting'] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  task: 'Task',
  milestone: 'Milestone',
  inspection: 'Inspection',
  meeting: 'Meeting',
}

export type ScheduleActivity = {
  id: string
  template_key: string | null
  name: string
  phase: string
  activity_type: ActivityType
  sort_order: number
  planned_start: string | null
  planned_end: string | null
  actual_start: string | null
  actual_end: string | null
  assigned_to: string | null
  percent_complete: number
  status: ActivityStatus
  weight: number
  delay_reason: string | null
  internal_notes: string | null
  public_note: string | null
  is_published: boolean
  updated_at: string
}

export type ScheduleDependency = { id: string; predecessor_id: string; successor_id: string }

export const ACTIVITY_COLUMNS =
  'id, template_key, name, phase, activity_type, sort_order, planned_start, planned_end, actual_start, actual_end, assigned_to, percent_complete, status, weight, delay_reason, internal_notes, public_note, is_published, updated_at'

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** An activity is late when its planned finish has passed without being completed. */
export function isOverdue(a: Pick<ScheduleActivity, 'status' | 'planned_end'>, today = todayIso()): boolean {
  return !!a.planned_end && a.planned_end < today && a.status !== 'completed' && a.status !== 'skipped'
}

export type DependencyConflict = { predecessor: ScheduleActivity; successor: ScheduleActivity }

/** Successors planned to start before their predecessor is planned to finish. Warnings only. */
export function findDateConflicts(activities: ScheduleActivity[], deps: ScheduleDependency[]): DependencyConflict[] {
  const byId = new Map(activities.map((a) => [a.id, a]))
  const conflicts: DependencyConflict[] = []
  for (const d of deps) {
    const predecessor = byId.get(d.predecessor_id)
    const successor = byId.get(d.successor_id)
    if (!predecessor || !successor || predecessor.status === 'skipped' || successor.status === 'skipped') continue
    const predEnd = predecessor.actual_end ?? predecessor.planned_end
    const succStart = successor.actual_start ?? successor.planned_start
    if (predEnd && succStart && succStart < predEnd) conflicts.push({ predecessor, successor })
  }
  return conflicts
}

/** Weighted completion, matching public.recalculate_project_progress. */
export function weightedProgress(activities: Pick<ScheduleActivity, 'status' | 'weight' | 'percent_complete'>[]): number {
  let total = 0
  let done = 0
  for (const a of activities) {
    const w = Number(a.weight)
    if (a.status === 'skipped' || w <= 0) continue
    total += w
    done += w * Number(a.percent_complete)
  }
  return total ? Math.round((done / total) * 100) / 100 : 0
}

export const EVENT_FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  phase: 'Phase',
  activity_type: 'Type',
  planned_start: 'Planned start',
  planned_end: 'Planned finish',
  actual_start: 'Actual start',
  actual_end: 'Actual finish',
  assigned_to: 'Assignee',
  percent_complete: 'Progress',
  status: 'Status',
  weight: 'Weight',
  delay_reason: 'Delay reason',
  public_note: 'Homeowner note',
  is_published: 'Visible to homeowner',
  internal_notes: 'Internal notes',
}
