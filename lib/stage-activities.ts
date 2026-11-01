import type { ProjectStatus } from './domain.ts'

export type StageActivityRow = {
  id: string
  project_id: string
  name: string
  phase: string
  status: string
  planned_end: string | null
  sort_order: number
}

export type StageDependency = { predecessor_id: string; successor_id: string }

export type StageNextActivity = { id: string; name: string; dueOn: string | null; overdue: boolean }

export type StageActivities =
  | { state: 'unavailable' }
  | { state: 'empty' }
  | { state: 'complete'; completed: number; total: number }
  | { state: 'next'; activity: StageNextActivity; completed: number; total: number }

const DONE = new Set(['completed', 'skipped'])

function phaseKey(phase: string): string {
  return phase
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/**
 * Which schedule phases make up a project stage. Schedule activities only carry a phase label, so the mapping is:
 * Preconstruction phase → preconstruction; Closeout phase → final inspection / punch list / substantial completion;
 * every other phase → under construction. Pipeline stages have no schedule phase; on hold, completed and cancelled
 * have no current working stage and return null.
 */
export function stagePhaseMatcher(status: ProjectStatus): ((phase: string) => boolean) | null {
  switch (status) {
    case 'preconstruction':
      return (p) => phaseKey(p) === 'preconstruction'
    case 'under_construction':
      return (p) => {
        const key = phaseKey(p)
        return key !== 'preconstruction' && key !== 'closeout'
      }
    case 'final_inspection':
    case 'punch_list':
    case 'substantially_complete':
      return (p) => phaseKey(p) === 'closeout'
    case 'on_hold':
    case 'completed':
    case 'cancelled':
      return null
    default:
      return () => false
  }
}

function byDueThenOrder(a: StageActivityRow, b: StageActivityRow): number {
  if (a.planned_end && b.planned_end && a.planned_end !== b.planned_end) return a.planned_end < b.planned_end ? -1 : 1
  if (a.planned_end && !b.planned_end) return -1
  if (!a.planned_end && b.planned_end) return 1
  return a.sort_order - b.sort_order
}

/**
 * Next actionable activity and completion count for one job's current stage. `activities` and `dependencies` must
 * already be limited to that job. "Not applicable" (skipped) activities are excluded from selection and counts.
 * Actionable = every predecessor is complete or not applicable; if none qualifies, the earliest open one is used.
 */
export function summarizeStageActivities(
  status: ProjectStatus,
  activities: StageActivityRow[],
  dependencies: StageDependency[],
  today: string,
): StageActivities | null {
  const matches = stagePhaseMatcher(status)
  if (!matches) return null
  const inStage = activities.filter((a) => a.status !== 'skipped' && matches(a.phase))
  if (!inStage.length) return { state: 'empty' }

  const total = inStage.length
  const completed = inStage.filter((a) => a.status === 'completed').length
  const open = inStage.filter((a) => !DONE.has(a.status))
  if (!open.length) return { state: 'complete', completed, total }

  const statusById = new Map(activities.map((a) => [a.id, a.status]))
  const blocked = new Set(
    dependencies
      .filter((d) => {
        const pred = statusById.get(d.predecessor_id)
        return pred !== undefined && !DONE.has(pred)
      })
      .map((d) => d.successor_id),
  )
  const actionable = open.filter((a) => !blocked.has(a.id))
  const next = [...(actionable.length ? actionable : open)].sort(byDueThenOrder)[0]
  return {
    state: 'next',
    completed,
    total,
    activity: {
      id: next.id,
      name: next.name,
      dueOn: next.planned_end,
      overdue: !!next.planned_end && next.planned_end < today,
    },
  }
}
