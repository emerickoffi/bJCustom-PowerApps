/**
 * Pure presentation and decision rules for subcontractor vetting. The authoritative status is computed in the
 * database (`subcontractor_qualification_summary`); this module only labels it and derives warnings from it, so the
 * directory, profile, project assignment form, and dashboard all read the same value.
 */

export const QUALIFICATION_MIGRATION = '20261113000010_subcontractor_qualification.sql'
export const EVIDENCE_BUCKET = 'subcontractor-vetting'
export const EXPIRING_SOON_DAYS = 30

export const QUALIFICATION_STATUSES = ['not_started', 'pending', 'qualified', 'not_cleared'] as const
export type QualificationStatus = (typeof QUALIFICATION_STATUSES)[number]

export const QUALIFICATION_STATUS_LABELS: Record<QualificationStatus, string> = {
  not_started: 'Not Started',
  pending: 'Pending',
  qualified: 'Qualified',
  not_cleared: 'Not Cleared',
}

export const QUALIFICATION_FILTERS = ['qualified', 'pending', 'not_cleared', 'not_started', 'expiring_soon'] as const
export type QualificationFilter = (typeof QUALIFICATION_FILTERS)[number]

export const QUALIFICATION_FILTER_LABELS: Record<QualificationFilter, string> = {
  qualified: 'Qualified',
  pending: 'Pending',
  not_cleared: 'Not Cleared',
  not_started: 'Not Started',
  expiring_soon: 'Expiring Soon',
}

export type AssignmentMode = 'advisory' | 'enforcement'

export type QualificationSummary = {
  subcontractor_company_id: string
  status: QualificationStatus
  started_at: string | null
  mandatory_total: number
  mandatory_satisfied: number
  rejected_count: number
  expired_count: number
  awaiting_review_count: number
  missing_count: number
  expiring_soon_count: number
  next_expiration: string | null
  last_reviewed_at: string | null
  decision_outcome: 'approved' | 'not_cleared' | null
  decision_at: string | null
  decision_by: string | null
  decision_template_version: number | null
  template_version: number
  assignment_mode: AssignmentMode
  criteria_met: boolean
}

export const QUALIFICATION_SUMMARY_COLUMNS =
  'subcontractor_company_id, status, started_at, mandatory_total, mandatory_satisfied, rejected_count, expired_count, awaiting_review_count, missing_count, expiring_soon_count, next_expiration, last_reviewed_at, decision_outcome, decision_at, decision_by, decision_template_version, template_version, assignment_mode, criteria_met'

export const ITEM_STATES = ['not_started', 'submitted', 'verified', 'rejected', 'not_applicable'] as const
export type ItemState = (typeof ITEM_STATES)[number]

export const ITEM_STATE_LABELS: Record<ItemState, string> = {
  not_started: 'Not Started',
  submitted: 'Pending Review',
  verified: 'Verified',
  rejected: 'Needs Correction',
  not_applicable: 'Not Applicable',
}

/** What an item counts as right now, after evidence and expiration are applied (mirrors the checklist view). */
export type EffectiveState = 'missing' | 'awaiting_review' | 'rejected' | 'expired' | 'satisfied'

export const CATEGORIES = ['business_tax', 'insurance', 'licenses_safety', 'experience_references', 'agreements'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABELS: Record<Category, string> = {
  business_tax: 'Business & Tax',
  insurance: 'Insurance',
  licenses_safety: 'Trade Licenses & Safety',
  experience_references: 'Experience & References',
  agreements: 'Agreements',
}

export type Applicability = 'required' | 'conditional' | 'optional'

export const APPLICABILITY_LABELS: Record<Applicability, string> = {
  required: 'Required',
  conditional: 'Conditional',
  optional: 'Optional',
}

export type BadgeTone = 'neutral' | 'warning' | 'success' | 'danger'

export function qualificationBadge(summary: Pick<QualificationSummary, 'status' | 'mandatory_satisfied' | 'mandatory_total'> | null): {
  label: string
  tone: BadgeTone
} {
  const status = summary?.status ?? 'not_started'
  switch (status) {
    case 'qualified':
      return { label: 'Qualified', tone: 'success' }
    case 'not_cleared':
      return { label: 'Not Cleared', tone: 'danger' }
    case 'pending':
      return {
        label: summary && summary.mandatory_total > 0 ? `Pending ${summary.mandatory_satisfied}/${summary.mandatory_total}` : 'Pending',
        tone: 'warning',
      }
    default:
      return { label: 'Not Started', tone: 'neutral' }
  }
}

export function parseQualificationFilter(value: string | undefined | null): QualificationFilter | null {
  return QUALIFICATION_FILTERS.includes(value as QualificationFilter) ? (value as QualificationFilter) : null
}

/** Missing summaries count as Not Started, so companies without any vetting still match that filter. */
export function matchesQualificationFilter(summary: QualificationSummary | undefined, filter: QualificationFilter): boolean {
  if (filter === 'expiring_soon') return (summary?.expiring_soon_count ?? 0) > 0
  return (summary?.status ?? 'not_started') === filter
}

export function primaryActionLabel(status: QualificationStatus): string {
  if (status === 'not_started') return 'Start Vetting'
  if (status === 'pending') return 'Continue Vetting'
  return 'Review Qualification'
}

/** Calendar date (YYYY-MM-DD) in the given time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Whole days from `today` to `date`, both YYYY-MM-DD. Negative when the date has passed. */
export function daysUntil(date: string, today: string): number {
  const toUtc = (d: string) => {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, day)
  }
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000)
}

export type ExpiryTier = 'expired' | '7' | '14' | '30'

/** Warning thresholds: 30, 14, and 7 days ahead, then expired. Null when there is nothing to warn about. */
export function expiryTier(expirationDate: string | null | undefined, today: string): ExpiryTier | null {
  if (!expirationDate) return null
  const days = daysUntil(expirationDate, today)
  if (days < 0) return 'expired'
  if (days <= 7) return '7'
  if (days <= 14) return '14'
  if (days <= EXPIRING_SOON_DAYS) return '30'
  return null
}

export function expiryLabel(expirationDate: string, today: string): string {
  const days = daysUntil(expirationDate, today)
  if (days < 0) return `Expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`
  if (days === 0) return 'Expires today'
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`
}

export type AssignmentWarning = { level: 'block' | 'warn'; message: string }

/**
 * Qualification guidance shown when assigning new project work. Advisory mode never blocks; enforcement mode blocks
 * anything that is not Qualified. Company activity is handled separately by the existing inactive check.
 */
export function assignmentWarning(
  summary: Pick<QualificationSummary, 'status' | 'expiring_soon_count' | 'next_expiration'> | null,
  mode: AssignmentMode,
): AssignmentWarning | null {
  const status = summary?.status ?? 'not_started'
  if (status === 'qualified') {
    if ((summary?.expiring_soon_count ?? 0) > 0) {
      return { level: 'warn', message: 'Qualified, but some required documents expire within 30 days.' }
    }
    return null
  }
  const reason =
    status === 'not_cleared'
      ? 'This subcontractor is Not Cleared.'
      : status === 'pending'
        ? 'Vetting is still in progress.'
        : 'This subcontractor has not been vetted.'
  if (mode === 'enforcement') {
    return { level: 'block', message: `${reason} Your company requires qualification before new project work.` }
  }
  return { level: 'warn', message: `${reason} You can still assign new projects; review qualification first.` }
}

export type QualificationAttention = {
  companyId: string
  companyName: string
  kind: 'awaiting_review' | 'missing' | 'expired' | 'expiring' | 'not_cleared_on_project'
  label: string
  detail: string
  href: string
  /** Lower sorts first. */
  rank: number
}

/** Dashboard items derived from summaries. One item per company, choosing its most urgent problem. */
export function buildQualificationAttention(
  rows: { summary: QualificationSummary; companyName: string; companyActive: boolean; currentProjects: number }[],
  today: string,
): QualificationAttention[] {
  const items: QualificationAttention[] = []
  for (const { summary: s, companyName, companyActive, currentProjects } of rows) {
    if (!companyActive) continue
    const href = `/subcontractors/${s.subcontractor_company_id}#qualification`
    const base = { companyId: s.subcontractor_company_id, companyName, href }
    if (s.status === 'not_cleared' && currentProjects > 0) {
      items.push({
        ...base,
        kind: 'not_cleared_on_project',
        label: 'Not Cleared on a current project',
        detail: `${currentProjects} current ${currentProjects === 1 ? 'project' : 'projects'}`,
        rank: 0,
      })
    } else if (s.expired_count > 0) {
      items.push({ ...base, kind: 'expired', label: 'Required document expired', detail: plural(s.expired_count, 'item'), rank: 1 })
    } else if (s.awaiting_review_count > 0) {
      items.push({ ...base, kind: 'awaiting_review', label: 'Evidence awaiting review', detail: plural(s.awaiting_review_count, 'item'), rank: 2 })
    } else if (s.expiring_soon_count > 0 && s.next_expiration) {
      items.push({ ...base, kind: 'expiring', label: 'Document expiring soon', detail: expiryLabel(s.next_expiration, today), rank: 3 })
    } else if (s.started_at && s.missing_count > 0) {
      items.push({ ...base, kind: 'missing', label: 'Missing mandatory evidence', detail: plural(s.missing_count, 'item'), rank: 4 })
    }
  }
  return items.sort((a, b) => a.rank - b.rank || a.companyName.localeCompare(b.companyName))
}

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`
}

export const EVIDENCE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024

export function validateEvidenceFile(file: { name: string; size: number; type: string }): string | null {
  if (!EVIDENCE_EXTENSIONS[file.type]) return `${file.name} is not a supported file type. Upload a PDF, PNG, JPEG, or WebP file.`
  if (file.size <= 0) return `${file.name} is empty.`
  if (file.size > MAX_EVIDENCE_BYTES) return `${file.name} is larger than 25 MB.`
  return null
}

/** Supabase/PostgREST signal that the vetting tables or functions are not deployed yet. */
export function isQualificationSetupError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    /subcontractor_qualification/.test(error.message ?? '') && /does not exist|could not find|schema cache/i.test(error.message ?? '')
  )
}
