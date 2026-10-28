/**
 * Deterministic project health rules used by the AI Assistant. The model may explain these
 * results but never overrides them. Pure and dependency-free so the rules are unit tested.
 */

export type HealthLevel = 'on_track' | 'needs_attention' | 'at_risk' | 'insufficient_data'

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  on_track: 'On Track',
  needs_attention: 'Needs Attention',
  at_risk: 'At Risk',
  insufficient_data: 'Insufficient Data',
}

export const HEALTH_RULES = {
  version: 1,
  overall: 'The worst level among assessed dimensions. Dimensions with insufficient data are listed but never lower the result. If no dimension can be assessed, the result is Insufficient Data.',
  schedule:
    'Overdue = planned_end before today and status not completed or skipped (the app rule). At Risk: 3+ overdue activities, or the target completion date has passed without a recorded completion. Needs Attention: any overdue or delayed activity, or the project is on hold. Insufficient Data: schedule off, unavailable, or empty. Completed projects are On Track for schedule and are never treated as delayed; cancelled projects are not assessed.',
  financial: `Compares the most relevant estimate's construction total (approved first, then submitted, then internal review; drafts and rejected excluded) with the project's recorded estimated budget. At Risk: estimate more than ${10}% over budget. Needs Attention: more than ${5}% over. Insufficient Data: no budget or no comparable estimate.`,
  issues_and_approvals:
    'At Risk: any open critical-priority issue, or 3+ overdue open issues. Needs Attention: any overdue or high-priority open issue, or a declined, expired, or failed signature request. Pending approvals and awaiting signatures are reported but do not change the level. Insufficient Data: issues and signatures both unavailable.',
} as const

const OVER_BUDGET_ATTENTION_PCT = 5
const OVER_BUDGET_RISK_PCT = 10
const RISK_OVERDUE_ACTIVITIES = 3
const RISK_OVERDUE_ISSUES = 3

const CLOSED_ACTIVITY = new Set(['completed', 'skipped'])
const ESTIMATE_PREFERENCE = ['approved', 'submitted', 'internal_review'] as const

export type HealthActivity = { name: string; status: string; planned_start: string | null; planned_end: string | null }
export type HealthEstimate = {
  estimate_number: string | null
  status: string
  construction_total: number | null
  estimate_date: string | null
}
export type HealthIssue = { priority: string; status: string; due_date: string | null }

export type HealthInput = {
  today: string
  status: string
  targetCompletionDate: string | null
  completionDate: string | null
  /** null when the schedule module is off or failed to load. */
  schedule: HealthActivity[] | null
  /** null when the estimates module is off or failed to load. */
  financial: { budget: number | null; estimates: HealthEstimate[] } | null
  /** null when issues are off or failed to load. */
  issues: { open: HealthIssue[]; awaitingBuilderApproval: number; awaitingHomeownerConfirmation: number } | null
  /** null when e-signatures are off or failed to load. */
  signatures: { awaiting: number; problems: number } | null
}

export type HealthDimension = { level: HealthLevel; reasons: string[]; facts: Record<string, unknown> }

export type HealthAssessment = {
  indicator: HealthLevel
  indicator_label: string
  dimensions: { schedule: HealthDimension; financial: HealthDimension; issues_and_approvals: HealthDimension }
}

const SEVERITY: Record<HealthLevel, number> = { insufficient_data: -1, on_track: 0, needs_attention: 1, at_risk: 2 }

export const isActivityOverdue = (a: Pick<HealthActivity, 'status' | 'planned_end'>, today: string) =>
  !!a.planned_end && a.planned_end < today && !CLOSED_ACTIVITY.has(a.status)

export const isIssueOverdue = (i: HealthIssue, today: string) =>
  !!i.due_date && i.due_date < today && i.status !== 'resolved' && i.status !== 'closed'

const dim = (level: HealthLevel, reasons: string[], facts: Record<string, unknown> = {}): HealthDimension => ({ level, reasons, facts })

function scheduleHealth(input: HealthInput): HealthDimension {
  const { today, status } = input
  if (status === 'completed') {
    return dim('on_track', ['The project is completed; remaining open activities are not treated as delays.'], {
      completion_date: input.completionDate,
    })
  }
  if (status === 'cancelled') return dim('insufficient_data', ['The project is cancelled; schedule health is not assessed.'])
  if (!input.schedule) return dim('insufficient_data', ['The schedule is not available for this project.'])
  const open = input.schedule.filter((a) => !CLOSED_ACTIVITY.has(a.status))
  if (!input.schedule.length) return dim('insufficient_data', ['No schedule activities are recorded yet.'])

  const overdue = open.filter((a) => isActivityOverdue(a, today))
  const delayed = open.filter((a) => a.status === 'delayed')
  const targetPassed = !!input.targetCompletionDate && input.targetCompletionDate < today && !input.completionDate
  const facts = {
    activities: input.schedule.length,
    completed: input.schedule.filter((a) => a.status === 'completed').length,
    overdue_activities: overdue.map((a) => ({ name: a.name, planned_end: a.planned_end })),
    delayed_activities: delayed.map((a) => a.name),
    target_completion_date: input.targetCompletionDate,
  }
  const reasons: string[] = []
  if (overdue.length) reasons.push(`${overdue.length} open ${overdue.length === 1 ? 'activity is' : 'activities are'} past the planned finish.`)
  if (delayed.length) reasons.push(`${delayed.length} ${delayed.length === 1 ? 'activity is' : 'activities are'} marked delayed.`)
  if (targetPassed) reasons.push(`The target completion date (${input.targetCompletionDate}) has passed with no completion recorded.`)
  if (status === 'on_hold') reasons.push('The project is on hold.')

  if (overdue.length >= RISK_OVERDUE_ACTIVITIES || targetPassed) return dim('at_risk', reasons, facts)
  if (overdue.length || delayed.length || status === 'on_hold') return dim('needs_attention', reasons, facts)
  return dim('on_track', ['No overdue or delayed activities.'], facts)
}

/** The estimate a budget comparison should use, or null when none is comparable. */
export function comparableEstimate(estimates: HealthEstimate[]): HealthEstimate | null {
  for (const status of ESTIMATE_PREFERENCE) {
    const match = estimates
      .filter((e) => e.status === status && typeof e.construction_total === 'number' && e.construction_total > 0)
      .sort((a, b) => (b.estimate_date ?? '').localeCompare(a.estimate_date ?? ''))[0]
    if (match) return match
  }
  return null
}

function financialHealth(input: HealthInput): HealthDimension {
  if (!input.financial) return dim('insufficient_data', ['Estimates are not available for this project.'])
  const { budget, estimates } = input.financial
  if (budget == null || budget <= 0) return dim('insufficient_data', ['No estimated budget is recorded on the project.'])
  const estimate = comparableEstimate(estimates)
  if (!estimate) {
    return dim('insufficient_data', ['No submitted, approved, or in-review estimate with a construction total to compare.'], {
      recorded_budget: budget,
    })
  }
  const total = estimate.construction_total as number
  const variance = total - budget
  const variancePct = Math.round((variance / budget) * 1000) / 10
  const facts = {
    recorded_budget: budget,
    compared_estimate: estimate.estimate_number,
    compared_estimate_status: estimate.status,
    estimate_construction_total: total,
    variance,
    variance_percent: variancePct,
    comparison: 'estimate construction total minus project estimated budget',
  }
  const label = estimate.estimate_number ? `Estimate ${estimate.estimate_number}` : 'The latest estimate'
  const reason = variance > 0 ? `${label} is ${variancePct}% over the recorded budget.` : `${label} is within the recorded budget.`
  if (variancePct > OVER_BUDGET_RISK_PCT) return dim('at_risk', [reason], facts)
  if (variancePct > OVER_BUDGET_ATTENTION_PCT) return dim('needs_attention', [reason], facts)
  return dim('on_track', [reason], facts)
}

function issuesHealth(input: HealthInput): HealthDimension {
  const { issues, signatures, today } = input
  if (!issues && !signatures) return dim('insufficient_data', ['Issues and signatures are not available for this project.'])
  const open = issues?.open ?? []
  const overdue = open.filter((i) => isIssueOverdue(i, today)).length
  const critical = open.filter((i) => i.priority === 'critical').length
  const high = open.filter((i) => i.priority === 'high').length
  const facts = {
    open_issues: issues ? open.length : 'not available',
    overdue_issues: issues ? overdue : 'not available',
    critical_issues: issues ? critical : 'not available',
    high_priority_issues: issues ? high : 'not available',
    awaiting_builder_approval: issues ? issues.awaitingBuilderApproval : 'not available',
    awaiting_homeowner_confirmation: issues ? issues.awaitingHomeownerConfirmation : 'not available',
    documents_awaiting_signatures: signatures ? signatures.awaiting : 'not available',
    signature_problems: signatures ? signatures.problems : 'not available',
  }
  const reasons: string[] = []
  if (critical) reasons.push(`${critical} open critical-priority ${critical === 1 ? 'issue' : 'issues'}.`)
  if (overdue) reasons.push(`${overdue} open ${overdue === 1 ? 'issue is' : 'issues are'} past due.`)
  if (high) reasons.push(`${high} open high-priority ${high === 1 ? 'issue' : 'issues'}.`)
  if (signatures?.problems) reasons.push(`${signatures.problems} signature ${signatures.problems === 1 ? 'request was' : 'requests were'} declined, expired, or failed.`)

  if (critical || overdue >= RISK_OVERDUE_ISSUES) return dim('at_risk', reasons, facts)
  if (overdue || high || signatures?.problems) return dim('needs_attention', reasons, facts)
  return dim('on_track', [open.length ? `${open.length} open ${open.length === 1 ? 'issue' : 'issues'}, none overdue or high priority.` : 'No open issues.'], facts)
}

export function assessProjectHealth(input: HealthInput): HealthAssessment {
  const dimensions = {
    schedule: scheduleHealth(input),
    financial: financialHealth(input),
    issues_and_approvals: issuesHealth(input),
  }
  const assessed = Object.values(dimensions).filter((d) => d.level !== 'insufficient_data')
  const indicator = assessed.length
    ? assessed.reduce((worst, d) => (SEVERITY[d.level] > SEVERITY[worst] ? d.level : worst), 'on_track' as HealthLevel)
    : 'insufficient_data'
  return { indicator, indicator_label: HEALTH_LABELS[indicator], dimensions }
}
