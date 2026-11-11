import { APP_TIME_ZONE } from '@/lib/format'
import type { DraftInput } from '@/app/actions/subcontract-quotes'

export function emptyRequestDraft(): DraftInput {
  return {
    title: '',
    trade: '',
    scope: '',
    document_ids: [],
    company_ids: [],
    deadline_local: '',
    deadline_timezone: APP_TIME_ZONE,
    cost_category: '',
    schedule_activity_id: '',
    work_window_start: '',
    work_window_end: '',
  }
}

export const QUOTES_MIGRATION = '20261130000010_subcontract_quote_requests.sql'
export const QUOTES_BUCKET = 'subcontract-quotes'
export const QUOTE_MAX_FILE_BYTES = 25 * 1024 * 1024
export const QUOTE_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.docx,.doc,.csv'

export const SUPPORTED_CURRENCIES = ['USD', 'CAD'] as const
export const QUOTE_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Edmonton',
  'America/Winnipeg',
  'America/Halifax',
] as const

export const QUOTE_DECISIONS_MIGRATION = '20261201000010_subcontract_quote_decisions.sql'

export type RequestStatus = 'draft' | 'open' | 'closed' | 'cancelled' | 'awarded'
export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
  awarded: 'Awarded',
}

export type QuoteDecision = 'selected' | 'not_selected' | 'rejected'
export const DECISION_LABELS: Record<QuoteDecision, string> = {
  selected: 'Selected',
  not_selected: 'Not selected',
  rejected: 'Rejected',
}

export const SELECTION_DISCLAIMER =
  'Selecting a quote does not sign a contract, approve payment, or authorize work to start. It records your decision and notifies the companies.'

export type TaxTreatment = 'included' | 'excluded' | 'not_applicable'
export const TAX_LABELS: Record<TaxTreatment, string> = {
  included: 'Tax included in amount',
  excluded: 'Tax excluded (added on top)',
  not_applicable: 'No tax applies',
}

export type ResponseState = 'awaiting' | 'submitted' | 'revision_requested' | 'declined'
export const RESPONSE_LABELS: Record<ResponseState, string> = {
  awaiting: 'Awaiting response',
  submitted: 'Quote submitted',
  revision_requested: 'Revision requested',
  declined: 'Declined',
}

export function responseState(
  invitationStatus: string,
  revisionRequestedAt: string | null,
  lastSubmittedAt: string | null,
): ResponseState {
  if (invitationStatus === 'declined') return 'declined'
  if (!lastSubmittedAt) return 'awaiting'
  if (revisionRequestedAt && revisionRequestedAt > lastSubmittedAt) return 'revision_requested'
  return 'submitted'
}

export type Alternate = { description: string; amount_cents: string | null }

export type QuoteRevision = {
  id: string
  invitation_id: string
  subcontractor_company_id: string
  revision_number: number
  status: 'draft' | 'submitted'
  scope_version: number | null
  amount_cents: number | null
  tax_treatment: TaxTreatment | null
  tax_amount_cents: number | null
  tax_details: string | null
  inclusions: string | null
  exclusions: string | null
  availability: string | null
  allowances: string | null
  assumptions: string | null
  alternates: Alternate[]
  estimated_duration_days: number | null
  valid_until: string | null
  row_version: number
  submitted_at: string | null
}

export const REVISION_COLUMNS =
  'id, invitation_id, subcontractor_company_id, revision_number, status, scope_version, amount_cents, tax_treatment, tax_amount_cents, tax_details, inclusions, exclusions, availability, allowances, assumptions, alternates, estimated_duration_days, valid_until, row_version, submitted_at'

export type ScopeDocument = { document_id: string; version_id: string; version_number: number; name: string; filename: string }

/** Decimal-safe: never goes through floating point. Returns null for empty input and 'invalid' for bad input. */
export function parseMoneyToCents(raw: string): string | null | 'invalid' {
  const s = raw.replace(/[\s,$]/g, '')
  if (!s) return null
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(s)
  if (!m) return 'invalid'
  const cents = BigInt(m[1]) * BigInt(100) + BigInt((m[2] ?? '').padEnd(2, '0') || '0')
  return cents.toString()
}

export function centsToInput(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined || cents === '') return ''
  const b = BigInt(cents)
  const whole = b / BigInt(100)
  const frac = (b % BigInt(100)).toString().padStart(2, '0')
  return `${whole}.${frac}`
}

export function formatMoney(cents: number | string | null | undefined, currency: string | null): string {
  if (cents === null || cents === undefined || cents === '') return '—'
  if (!currency) return centsToInput(cents)
  const b = BigInt(cents)
  const whole = Number(b / BigInt(100))
  const frac = Number(b % BigInt(100)) / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(whole + frac)
}

/** Total payable. Unknown excluded tax yields null, never a guessed zero. Alternates are never added. */
export function payableCents(rev: Pick<QuoteRevision, 'amount_cents' | 'tax_treatment' | 'tax_amount_cents'>): string | null {
  if (rev.amount_cents === null) return null
  if (rev.tax_treatment === 'excluded') {
    if (rev.tax_amount_cents === null) return null
    return (BigInt(rev.amount_cents) + BigInt(rev.tax_amount_cents)).toString()
  }
  return BigInt(rev.amount_cents).toString()
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - utcMs
}

/** Converts a wall-clock "YYYY-MM-DDTHH:mm" in the given IANA zone to an ISO instant. */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local)
  if (!m) return null
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  let utc = guess - tzOffsetMs(guess, timeZone)
  utc = guess - tzOffsetMs(utc, timeZone)
  return new Date(utc).toISOString()
}

export function isoToZonedLocal(iso: string | null, timeZone: string | null): string {
  if (!iso || !timeZone) return ''
  const ms = Date.parse(iso)
  const local = new Date(ms + tzOffsetMs(ms, timeZone))
  return local.toISOString().slice(0, 16)
}

export function formatDeadline(iso: string | null, timeZone: string | null): string {
  if (!iso) return 'No deadline set'
  const tz = timeZone ?? 'UTC'
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
  return text
}

export function isQuoteSetupError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return ['42P01', '42883', 'PGRST202', 'PGRST205', '42703'].includes(error.code ?? '') ||
    /subcontract_quote|does not exist|schema cache/i.test(error.message ?? '')
}

export const QUOTES_SETUP_MESSAGE =
  'Quote requests are not set up in this environment yet. Ask an administrator to apply the pending database migration.'

export function quoteDbError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.'
  if (isQuoteSetupError(error)) return QUOTES_SETUP_MESSAGE
  if (['P0001', 'P0002', '40001'].includes(error.code ?? '') && error.message) return error.message
  if (error.code === '42501') return error.message || 'You do not have permission to perform this action.'
  if (error.code === '23514') return 'Some values are outside the allowed range. Check the amounts and text lengths.'
  return 'Something went wrong. Please try again.'
}
