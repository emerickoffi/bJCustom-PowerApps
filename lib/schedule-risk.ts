import { AT_RISK_OVERDUE_COUNT, AT_RISK_OVERDUE_DAYS, daysBetween } from './project-health.ts'

/**
 * Stage-aware schedule readiness. Deterministic and explainable.
 *
 * The data model records only a *proposed* start date (`projects.proposed_start_date`); there is no confirmed-start
 * field. Start-window findings are therefore never Critical: Critical comes only from verified slippage on the
 * schedule itself (delayed activities, or overdue work past the Project Health At Risk thresholds).
 */
export type ScheduleRiskLevel = 'critical' | 'warning' | 'needs_data' | 'monitoring' | 'on_track' | 'not_applicable'

export const SCHEDULE_RISK_LABELS: Record<ScheduleRiskLevel, string> = {
  critical: 'Critical',
  warning: 'Warning',
  needs_data: 'Needs Data',
  monitoring: 'Monitoring',
  on_track: 'On Track',
  not_applicable: 'Not Applicable',
}

export const START_RISK_WINDOW_DAYS = 14

/** Committed stages: a contract exists and the construction schedule is expected. Pipeline and completed stages are not evaluated. */
const PRE_START = new Set(['preconstruction'])
const BUILDING = new Set(['under_construction'])
const CLOSEOUT = new Set(['final_inspection', 'punch_list', 'substantially_complete'])

export type ScheduleRiskInput = {
  status: string
  proposedStartDate: string | null
  activityCount: number
  datedActivityCount: number
  delayedCount: number
  overdueCount: number
  maxDaysOverdue: number
}

export type ScheduleRisk = { level: ScheduleRiskLevel; reason: string }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function startPhrase(days: number) {
  if (days > 0) return `Proposed start in ${plural(days, 'day')}`
  if (days === 0) return 'Proposed start is today'
  return `Proposed start was ${plural(-days, 'day')} ago`
}

export function evaluateScheduleRisk(p: ScheduleRiskInput, today: string, windowDays = START_RISK_WINDOW_DAYS): ScheduleRisk {
  const committed = PRE_START.has(p.status) || BUILDING.has(p.status) || CLOSEOUT.has(p.status)
  if (!committed) return { level: 'not_applicable', reason: 'No construction schedule is expected at this stage' }

  if (p.delayedCount > 0) return { level: 'critical', reason: `${plural(p.delayedCount, 'activity', 'activities')} marked delayed` }
  if (p.overdueCount > 0) {
    const text = `${plural(p.overdueCount, 'activity', 'activities')} past planned finish`
    if (p.overdueCount >= AT_RISK_OVERDUE_COUNT || p.maxDaysOverdue > AT_RISK_OVERDUE_DAYS) {
      return { level: 'critical', reason: `${text} (up to ${plural(p.maxDaysOverdue, 'day')})` }
    }
    return { level: 'warning', reason: text }
  }

  if (PRE_START.has(p.status)) {
    if (!p.proposedStartDate) {
      return { level: 'needs_data', reason: 'No proposed start date, so readiness cannot be assessed' }
    }
    const days = daysBetween(today, p.proposedStartDate)
    const dated = p.datedActivityCount > 0
    if (days <= windowDays && !dated) {
      return {
        level: 'warning',
        reason:
          p.activityCount === 0
            ? `${startPhrase(days)} without a configured schedule`
            : `${startPhrase(days)} and no schedule activity has planned dates`,
      }
    }
    if (!dated) return { level: 'monitoring', reason: `${startPhrase(days)}; schedule not built yet` }
    return { level: 'on_track', reason: `${startPhrase(days)}; schedule has planned dates` }
  }

  if (p.datedActivityCount === 0) {
    return {
      level: 'needs_data',
      reason: p.activityCount === 0 ? 'No schedule activities to measure progress against' : 'Schedule activities have no planned dates',
    }
  }
  return { level: 'on_track', reason: 'No delayed or overdue activities' }
}

export function isScheduleRisk(level: ScheduleRiskLevel) {
  return level === 'critical' || level === 'warning'
}

export function isEvaluated(level: ScheduleRiskLevel) {
  return level !== 'not_applicable'
}
