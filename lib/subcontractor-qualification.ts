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

/** Workflow stage shown to people (`vetting_status` on the summary view). `status` above drives assignment rules. */
export const VETTING_STATUSES = ['new', 'requested', 'in_review', 'missing_items', 'conditional', 'qualified', 'not_qualified'] as const
export type VettingStatus = (typeof VETTING_STATUSES)[number]

export const VETTING_STATUS_LABELS: Record<VettingStatus, string> = {
  new: 'New',
  requested: 'Requested',
  in_review: 'In Review',
  missing_items: 'Missing Items',
  conditional: 'Conditional',
  qualified: 'Qualified',
  not_qualified: 'Not Qualified',
}

export const QUALIFICATION_FILTERS = [
  'qualified',
  'conditional',
  'missing_items',
  'in_review',
  'not_qualified',
  'not_started',
  'expiring_soon',
] as const
export type QualificationFilter = (typeof QUALIFICATION_FILTERS)[number]

export const QUALIFICATION_FILTER_LABELS: Record<QualificationFilter, string> = {
  qualified: 'Qualified',
  conditional: 'Conditional',
  missing_items: 'Missing Items',
  in_review: 'In Review',
  not_qualified: 'Not Qualified',
  not_started: 'Not Started',
  expiring_soon: 'Expiring Soon',
}

/** Older links used the coarse statuses; keep them working. */
const LEGACY_FILTERS: Record<string, QualificationFilter> = {
  pending: 'in_review',
  not_cleared: 'not_qualified',
  new: 'not_started',
  requested: 'not_started',
}

export const QUALIFICATION_SORTS = ['name', 'status', 'completion', 'expiration'] as const
export type QualificationSort = (typeof QUALIFICATION_SORTS)[number]
export const QUALIFICATION_SORT_LABELS: Record<QualificationSort, string> = {
  name: 'Company name',
  status: 'Qualification status',
  completion: 'Completion',
  expiration: 'Soonest expiration',
}

export type AssignmentMode = 'advisory' | 'enforcement'

export type QualificationSummary = {
  subcontractor_company_id: string
  status: QualificationStatus
  vetting_status: VettingStatus
  completion_percent: number
  activated_at: string | null
  requested_at: string | null
  progressed_count: number
  optional_open_count: number
  decision_notes: string | null
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
  decision_outcome: 'approved' | 'conditional' | 'not_cleared' | null
  decision_at: string | null
  decision_by: string | null
  decision_template_version: number | null
  template_version: number
  assignment_mode: AssignmentMode
  criteria_met: boolean
}

export const QUALIFICATION_SUMMARY_COLUMNS =
  'subcontractor_company_id, status, vetting_status, completion_percent, activated_at, requested_at, progressed_count, optional_open_count, decision_notes, started_at, mandatory_total, mandatory_satisfied, rejected_count, expired_count, awaiting_review_count, missing_count, expiring_soon_count, next_expiration, last_reviewed_at, decision_outcome, decision_at, decision_by, decision_template_version, template_version, assignment_mode, criteria_met'

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

export type BadgeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

export const VETTING_TONES: Record<VettingStatus, BadgeTone> = {
  new: 'neutral',
  requested: 'info',
  in_review: 'info',
  missing_items: 'warning',
  conditional: 'warning',
  qualified: 'success',
  not_qualified: 'danger',
}

type BadgeInput = Partial<Pick<QualificationSummary, 'vetting_status' | 'status'>> | null

/** Falls back to the coarse status for rows read before the vetting columns existed. */
export function vettingStatusOf(summary: BadgeInput | undefined): VettingStatus {
  if (summary?.vetting_status) return summary.vetting_status
  switch (summary?.status) {
    case 'qualified':
      return 'qualified'
    case 'not_cleared':
      return 'not_qualified'
    case 'pending':
      return 'in_review'
    default:
      return 'new'
  }
}

export function qualificationBadge(summary: BadgeInput): { label: string; tone: BadgeTone } {
  const v = vettingStatusOf(summary)
  return { label: VETTING_STATUS_LABELS[v], tone: VETTING_TONES[v] }
}

export function readinessLabel(summary: BadgeInput): { label: string; tone: BadgeTone } {
  const v = vettingStatusOf(summary)
  if (v === 'qualified') return { label: 'Ready for work', tone: 'success' }
  if (v === 'conditional') return { label: 'Usable with warnings', tone: 'warning' }
  if (v === 'not_qualified') return { label: 'Not approved', tone: 'danger' }
  return { label: 'Not ready', tone: 'neutral' }
}

export function blockerCount(s: Pick<QualificationSummary, 'missing_count' | 'rejected_count' | 'expired_count'>): number {
  return s.missing_count + s.rejected_count + s.expired_count
}

export function progressSummary(s: QualificationSummary): string {
  if (!s.mandatory_total) return 'No required items yet'
  return `${s.mandatory_satisfied} of ${s.mandatory_total} required items approved`
}

export function parseQualificationFilter(value: string | undefined | null): QualificationFilter | null {
  if (!value) return null
  if (QUALIFICATION_FILTERS.includes(value as QualificationFilter)) return value as QualificationFilter
  return LEGACY_FILTERS[value] ?? null
}

export function parseQualificationSort(value: string | undefined | null): QualificationSort {
  return QUALIFICATION_SORTS.includes(value as QualificationSort) ? (value as QualificationSort) : 'name'
}

/** Missing summaries count as New (Not Started), so companies without any vetting still match that filter. */
export function matchesQualificationFilter(summary: QualificationSummary | undefined, filter: QualificationFilter): boolean {
  if (filter === 'expiring_soon') return (summary?.expiring_soon_count ?? 0) > 0
  const v = vettingStatusOf(summary)
  if (filter === 'not_started') return v === 'new' || v === 'requested'
  return v === filter
}

/** Problems first, then work in progress, then finished. */
const STATUS_SORT_RANK: Record<VettingStatus, number> = {
  not_qualified: 0,
  missing_items: 1,
  in_review: 2,
  requested: 3,
  new: 4,
  conditional: 5,
  qualified: 6,
}

export function compareByQualification(
  sort: QualificationSort,
  a: QualificationSummary | undefined,
  b: QualificationSummary | undefined,
): number {
  if (sort === 'status') return STATUS_SORT_RANK[vettingStatusOf(a)] - STATUS_SORT_RANK[vettingStatusOf(b)]
  if (sort === 'completion') return (b?.completion_percent ?? 0) - (a?.completion_percent ?? 0)
  if (sort === 'expiration') {
    const x = a?.next_expiration ?? '9999-12-31'
    const y = b?.next_expiration ?? '9999-12-31'
    return x < y ? -1 : x > y ? 1 : 0
  }
  return 0
}

export type StageState = 'complete' | 'current' | 'warning' | 'failed' | 'upcoming'
export type VettingStage = { key: string; label: string; state: StageState; detail: string | null }

/**
 * Four-step diagram: New → Requested → In Review → Outcome. Missing Items is shown on the review step (amber) because
 * work continues there; the final step takes the label of the decision once there is one.
 */
export function buildVettingStages(summary: QualificationSummary | null): VettingStage[] {
  const v = vettingStatusOf(summary)
  const order: VettingStatus[] = ['new', 'requested', 'in_review']
  const reached = v === 'new' ? 0 : v === 'requested' ? 1 : v === 'in_review' || v === 'missing_items' ? 2 : 3
  const stages: VettingStage[] = order.map((key, i) => ({
    key,
    label: VETTING_STATUS_LABELS[key],
    state: i < reached ? 'complete' : i === reached ? 'current' : 'upcoming',
    detail: null,
  }))
  if (v === 'missing_items') {
    stages[2] = {
      key: 'missing_items',
      label: 'Missing Items',
      state: 'warning',
      detail: summary ? plural(blockerCount(summary), 'blocker') : null,
    }
  }
  const outcome: VettingStage =
    v === 'qualified'
      ? { key: 'qualified', label: 'Qualified', state: 'complete', detail: 'Ready for work' }
      : v === 'conditional'
        ? { key: 'conditional', label: 'Conditional', state: 'warning', detail: 'Usable with warnings' }
        : v === 'not_qualified'
          ? { key: 'not_qualified', label: 'Not Qualified', state: 'failed', detail: 'Not approved' }
          : { key: 'decision', label: 'Decision', state: 'upcoming', detail: 'Qualified, Conditional, or Not Qualified' }
  return [...stages, outcome]
}

/** One sentence telling the reviewer what to do next; null when nothing is needed. */
export function nextRequiredAction(summary: QualificationSummary | null, today: string): string | null {
  const v = vettingStatusOf(summary)
  const s = summary
  switch (v) {
    case 'new':
      return 'Start vetting or request documents from this subcontractor.'
    case 'requested':
      return 'Waiting on documents. Upload them here as they arrive.'
    case 'missing_items': {
      if (!s) return 'Resolve the missing items.'
      const parts = [
        s.expired_count ? `${plural(s.expired_count, 'expired document')}` : null,
        s.rejected_count ? `${s.rejected_count} needing correction` : null,
        s.missing_count ? `${s.missing_count} not received` : null,
      ].filter(Boolean)
      return `Resolve ${plural(blockerCount(s), 'blocker')}: ${parts.join(', ')}.`
    }
    case 'in_review':
      if (s?.awaiting_review_count) return `Review ${plural(s.awaiting_review_count, 'submitted item')}.`
      if (s?.criteria_met) return 'All required items are approved. Record the final decision.'
      return 'Continue reviewing the checklist.'
    case 'conditional':
      if (s?.next_expiration && expiryTier(s.next_expiration, today)) {
        return `Renew the document that ${expiryLabel(s.next_expiration, today).toLowerCase()}.`
      }
      return 'Resolve the noted conditions, then approve fully.'
    case 'qualified':
      if (s?.next_expiration && expiryTier(s.next_expiration, today)) {
        return `Renew the document that ${expiryLabel(s.next_expiration, today).toLowerCase()}.`
      }
      return null
    case 'not_qualified':
      return 'Reopen review if circumstances change.'
  }
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

export function plural(n: number, word: string) {
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
