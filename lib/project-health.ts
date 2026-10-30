export type HealthLevel = 'at_risk' | 'needs_attention' | 'insufficient_data' | 'on_track'

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  at_risk: 'At Risk',
  needs_attention: 'Needs Attention',
  insufficient_data: 'Insufficient Data',
  on_track: 'On Track',
}

/** Verified per-project counts. Every field comes from a real record; nothing is estimated. */
export type ProjectHealthSignals = {
  scheduleEnabled: boolean
  /** Activities on the project's schedule, any status. 0 means no schedule to judge against. */
  activityCount: number
  delayedCount: number
  /** Open activities past planned finish, excluding those already counted as delayed. */
  overdueCount: number
  /** Days the oldest overdue activity is past its planned finish. */
  maxDaysOverdue: number
  openIssueCount: number
  pendingActionCount: number
  reportedDelayCount: number
}

export type ProjectHealth = { level: HealthLevel; reasons: string[] }

/** Overdue work this far past its planned finish escalates a project to At Risk. */
export const AT_RISK_OVERDUE_DAYS = 14
/** This many overdue activities at once escalates a project to At Risk. */
export const AT_RISK_OVERDUE_COUNT = 3

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/**
 * Deterministic, explainable rules. A project is only "On Track" when it has a schedule to measure
 * and no verified issue; missing data is reported as such instead of being shown as healthy.
 */
export function computeProjectHealth(s: ProjectHealthSignals): ProjectHealth {
  const risk: string[] = []
  const attention: string[] = []

  if (s.delayedCount > 0) risk.push(`${plural(s.delayedCount, 'activity', 'activities')} marked delayed`)
  if (s.overdueCount > 0) {
    const text = `${plural(s.overdueCount, 'activity', 'activities')} past planned finish`
    if (s.overdueCount >= AT_RISK_OVERDUE_COUNT || s.maxDaysOverdue > AT_RISK_OVERDUE_DAYS) {
      risk.push(s.maxDaysOverdue > AT_RISK_OVERDUE_DAYS ? `${text} (up to ${s.maxDaysOverdue} days)` : text)
    } else {
      attention.push(text)
    }
  }
  if (s.openIssueCount > 0) attention.push(`${plural(s.openIssueCount, 'open punch list issue')}`)
  if (s.pendingActionCount > 0) attention.push(`${plural(s.pendingActionCount, 'pending action')} for you`)
  if (s.reportedDelayCount > 0) attention.push(`${plural(s.reportedDelayCount, 'delay')} reported in Daily Logs this week`)

  if (risk.length) return { level: 'at_risk', reasons: [...risk, ...attention] }
  if (attention.length) return { level: 'needs_attention', reasons: attention }
  if (!s.scheduleEnabled) return { level: 'insufficient_data', reasons: ['Schedule module is off, so progress cannot be measured'] }
  if (s.activityCount === 0) return { level: 'insufficient_data', reasons: ['No schedule activities to measure progress against'] }
  return { level: 'on_track', reasons: ['Schedule current with no open issues'] }
}

const LEVEL_ORDER: Record<HealthLevel, number> = { at_risk: 0, needs_attention: 1, insufficient_data: 2, on_track: 3 }

export function compareHealth(a: HealthLevel, b: HealthLevel): number {
  return LEVEL_ORDER[a] - LEVEL_ORDER[b]
}

/** Whole days between two YYYY-MM-DD calendar dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}
