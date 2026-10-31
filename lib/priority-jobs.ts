import type { ProjectStatus } from './domain.ts'
import type { HealthLevel, ProjectHealth } from './project-health.ts'
import { rankPortfolio, type PortfolioRow, type PortfolioSignals } from './portfolio.ts'

export const PRIORITY_JOBS_LIMIT = 6

const HEALTH_RANK: Partial<Record<HealthLevel, number>> = { at_risk: 0, needs_attention: 1 }

/**
 * Verified health risk first (At Risk, then Needs Attention), then the existing portfolio ordering
 * (open action items, soonest dated work, active, pipeline, completed). Missing data never raises a project.
 */
export function rankPriorityJobs(
  rows: PortfolioRow[],
  signals: PortfolioSignals,
  health: ReadonlyMap<string, ProjectHealth>,
  limit = PRIORITY_JOBS_LIMIT,
): string[] {
  const ordered = rankPortfolio(rows, signals, null, rows.length)
  const position = new Map(ordered.map((id, i) => [id, i]))
  const rank = (id: string) => HEALTH_RANK[health.get(id)?.level ?? 'on_track'] ?? 2
  return [...ordered].sort((a, b) => rank(a) - rank(b) || position.get(a)! - position.get(b)!).slice(0, limit)
}

export type StageGroup = 'pipeline' | 'preconstruction' | 'construction' | 'closeout' | 'completed' | 'on_hold' | 'cancelled'

export function stageGroup(status: ProjectStatus): StageGroup {
  switch (status) {
    case 'preconstruction':
      return 'preconstruction'
    case 'under_construction':
      return 'construction'
    case 'final_inspection':
    case 'punch_list':
    case 'substantially_complete':
      return 'closeout'
    case 'completed':
      return 'completed'
    case 'on_hold':
      return 'on_hold'
    case 'cancelled':
      return 'cancelled'
    default:
      return 'pipeline'
  }
}

export type JobSummaryInput = {
  status: ProjectStatus
  progressPercent: number | null
  hasSchedule: boolean
  nextActivity: { name: string; dueOn: string | null; overdue: boolean } | null
  holdReason: string | null
  warranty: { milestoneLabel: string | null; milestoneDueOn: string | null } | null
  warrantyEnabled: boolean
  health: ProjectHealth | null
}

export type JobSummary = {
  /** The next verified step, or an honest statement that none is recorded. */
  text: string
  dueOn: string | null
  overdue: boolean
  /** Construction progress, only where a real schedule backs it. */
  progress: number | null
}

/** Stage-aware, one-line summary built only from records that exist. */
export function summarizeJob(j: JobSummaryInput): JobSummary {
  const group = stageGroup(j.status)
  const next = j.nextActivity
  const fromNext = (fallback: string): JobSummary =>
    next
      ? { text: next.name, dueOn: next.dueOn, overdue: next.overdue, progress: null }
      : { text: fallback, dueOn: null, overdue: false, progress: null }

  switch (group) {
    case 'pipeline':
      return fromNext('No scheduled next step')
    case 'preconstruction':
      return j.hasSchedule ? fromNext('Schedule has no open activities') : fromNext('Schedule not set up yet')
    case 'construction': {
      const summary = fromNext(j.hasSchedule ? 'No upcoming activity scheduled' : 'Schedule not set up yet')
      const progress = j.hasSchedule && j.progressPercent !== null ? Math.round(Number(j.progressPercent)) : null
      return { ...summary, progress }
    }
    case 'closeout': {
      const issue = j.health?.reasons.find((r) => /issue|action|sign/i.test(r))
      if (issue) return { text: issue, dueOn: null, overdue: false, progress: null }
      return fromNext('No open closeout items recorded')
    }
    case 'completed':
      if (!j.warrantyEnabled) return { text: 'Completed', dueOn: null, overdue: false, progress: null }
      if (j.warranty?.milestoneLabel)
        return { text: j.warranty.milestoneLabel, dueOn: j.warranty.milestoneDueOn, overdue: false, progress: null }
      return { text: j.warranty ? 'Warranty active' : 'No warranty record', dueOn: null, overdue: false, progress: null }
    case 'on_hold':
      return { text: j.holdReason ? `On hold: ${j.holdReason}` : 'On hold', dueOn: null, overdue: false, progress: null }
    case 'cancelled':
      return { text: 'Cancelled', dueOn: null, overdue: false, progress: null }
  }
}
