export const EXPIRING_WINDOW_DAYS = 30
/** Builder response target used to flag stalled claims. No appointment due dates exist yet, so this is the only verifiable SLA. */
export const SERVICE_RESPONSE_DAYS = 14

export type CoverageState = 'active' | 'expiring_soon' | 'expired' | 'not_applicable' | 'unavailable'

export const COVERAGE_STATE_LABELS: Record<CoverageState, string> = {
  active: 'Active',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  not_applicable: 'Not applicable',
  unavailable: 'Data unavailable',
}

export type CoverageMilestone = {
  due_on: string | null
  reached_at: string | null
}

function utcDay(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcDay(toIso) - utcDay(fromIso)) / 86_400_000)
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(utcDay(iso) + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Coverage state comes from the authoritative due date compared against the org's today.
 * A milestone whose due date has passed is expired even if the scheduled job has not marked it reached yet,
 * and a reached milestone is always expired.
 */
export function coverageState(
  milestone: CoverageMilestone | null | undefined,
  todayIso: string,
  windowDays = EXPIRING_WINDOW_DAYS,
): { state: CoverageState; daysRemaining: number | null } {
  if (!milestone) return { state: 'not_applicable', daysRemaining: null }
  if (!milestone.due_on || !/^\d{4}-\d{2}-\d{2}/.test(milestone.due_on)) return { state: 'unavailable', daysRemaining: null }
  const remaining = daysBetween(todayIso, milestone.due_on)
  if (milestone.reached_at || remaining < 0) return { state: 'expired', daysRemaining: null }
  return { state: remaining <= windowDays ? 'expiring_soon' : 'active', daysRemaining: remaining }
}

/** Fraction of the period elapsed, 0..1, for the timeline bar. */
export function coverageProgress(startIso: string, dueIso: string, todayIso: string): number {
  const total = daysBetween(startIso, dueIso)
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, daysBetween(startIso, todayIso) / total))
}

export type ClaimStatus =
  | 'submitted'
  | 'under_review'
  | 'info_requested'
  | 'accepted'
  | 'not_covered'
  | 'in_progress'
  | 'ready_for_validation'
  | 'closed'

export const OPEN_CLAIM_STATUSES: ClaimStatus[] = [
  'submitted',
  'under_review',
  'info_requested',
  'accepted',
  'not_covered',
  'in_progress',
  'ready_for_validation',
]

/** Statuses where the next move belongs to the builder (not waiting on the homeowner). */
export const BUILDER_OWNED_STATUSES: ClaimStatus[] = ['submitted', 'under_review', 'accepted', 'in_progress']

export type ProgressStepKey = 'submitted' | 'review' | 'planning' | 'repair' | 'completed' | 'confirmation' | 'closed'
export type StepState = 'complete' | 'current' | 'upcoming' | 'attention' | 'skipped'

export const PROGRESS_STEPS: { key: ProgressStepKey; label: string }[] = [
  { key: 'submitted', label: 'Submitted' },
  { key: 'review', label: 'Coverage review' },
  { key: 'planning', label: 'Service planning' },
  { key: 'repair', label: 'Repair in progress' },
  { key: 'completed', label: 'Repair completed' },
  { key: 'confirmation', label: 'Homeowner confirmation' },
  { key: 'closed', label: 'Closed' },
]

export type ClaimProgressInput = {
  status: string
  coverage_decision: string | null
  homeowner_validation: string
  /** Event types recorded in warranty_claim_events, used to detect reopen/rejection history. */
  eventTypes?: string[]
}

export type ClaimProgress = {
  steps: { key: ProgressStepKey; label: string; state: StepState }[]
  outcome: 'in_progress' | 'info_required' | 'not_covered' | 'reopened' | 'resolved'
}

/**
 * Maps the canonical database status onto the conceptual 7-step workflow without inventing history.
 * Steps before the current one are marked complete only because the DB transition rules make them prerequisites.
 */
export function claimProgress(input: ClaimProgressInput): ClaimProgress {
  const status = input.status as ClaimStatus
  const notCovered = input.coverage_decision === 'not_covered' || status === 'not_covered'
  const reopened = (input.eventTypes ?? []).includes('reject_repair') && status === 'in_progress'

  let currentIndex: number
  let attention = false
  switch (status) {
    case 'submitted':
      currentIndex = 0
      break
    case 'under_review':
      currentIndex = 1
      break
    case 'info_requested':
      currentIndex = 1
      attention = true
      break
    case 'not_covered':
      currentIndex = 1
      break
    case 'accepted':
      currentIndex = 2
      break
    case 'in_progress':
      currentIndex = 3
      attention = reopened
      break
    case 'ready_for_validation':
      currentIndex = input.homeowner_validation === 'accepted' ? 6 : 5
      break
    case 'closed':
      currentIndex = 7
      break
    default:
      currentIndex = 0
  }

  const steps = PROGRESS_STEPS.map((step, i) => {
    let state: StepState
    if (notCovered && i >= 2 && i <= 5) state = 'skipped'
    else if (notCovered && status === 'not_covered' && i === 1) state = 'complete'
    else if (notCovered && status === 'not_covered' && i === 6) state = 'current'
    else if (i < currentIndex) state = 'complete'
    else if (i === currentIndex) state = attention ? 'attention' : 'current'
    else state = 'upcoming'
    if (status === 'closed') state = notCovered && i >= 2 && i <= 5 ? 'skipped' : 'complete'
    return { ...step, state }
  })

  const outcome: ClaimProgress['outcome'] = notCovered
    ? 'not_covered'
    : status === 'info_requested'
      ? 'info_required'
      : reopened
        ? 'reopened'
        : status === 'closed'
          ? 'resolved'
          : 'in_progress'

  return { steps, outcome }
}

export function nextClaimAction(status: string, homeownerValidation: string, audience: 'staff' | 'homeowner'): string {
  const staff: Record<string, string> = {
    submitted: 'Start coverage review',
    under_review: 'Record a coverage decision',
    info_requested: 'Waiting on homeowner information',
    accepted: 'Plan service and start the repair',
    in_progress: 'Complete the repair and record corrective work',
    ready_for_validation:
      homeownerValidation === 'accepted' ? 'Close the claim' : 'Waiting on homeowner confirmation',
    not_covered: 'Close the claim with the documented decision',
    closed: 'No action required',
  }
  const homeowner: Record<string, string> = {
    submitted: 'Your builder will review this claim',
    under_review: 'Your builder is reviewing coverage',
    info_requested: 'Reply with the requested information',
    accepted: 'Your builder is planning the repair',
    in_progress: 'Repair is underway',
    ready_for_validation:
      homeownerValidation === 'accepted' ? 'Your builder will close the claim' : 'Confirm whether the repair is resolved',
    not_covered: 'See the coverage decision below',
    closed: 'No action required',
  }
  return (audience === 'staff' ? staff : homeowner)[status] ?? '—'
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n'
}
