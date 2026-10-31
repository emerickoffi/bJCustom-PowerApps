import { ESTIMATE_CATEGORIES } from './estimates.ts'
import { lineCostCents, parseQuantityMilli, parseSignedDollarsToCents } from './financials.ts'

export const CHANGE_ORDER_STATUSES = ['draft', 'internal_review', 'awaiting_homeowner', 'approved', 'rejected', 'void'] as const
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number]

export const CHANGE_ORDER_STATUS_LABELS: Record<ChangeOrderStatus, string> = {
  draft: 'Draft',
  internal_review: 'Internal review',
  awaiting_homeowner: 'Awaiting homeowner',
  approved: 'Approved',
  rejected: 'Rejected',
  void: 'Void',
}

export const CHANGE_ORDER_STATUS_TONES: Record<ChangeOrderStatus, 'neutral' | 'sage' | 'info' | 'warning' | 'danger'> = {
  draft: 'neutral',
  internal_review: 'warning',
  awaiting_homeowner: 'warning',
  approved: 'sage',
  rejected: 'danger',
  void: 'neutral',
}

/** Display-only progression; each step maps onto a canonical status and never introduces a new one. */
export const CHANGE_ORDER_PROGRESS = [
  { key: 'draft', label: 'Draft' },
  { key: 'internal_review', label: 'Internal review' },
  { key: 'awaiting_homeowner', label: 'Awaiting homeowner' },
  { key: 'decision', label: 'Decision' },
] as const

export type ProgressStepState = 'complete' | 'current' | 'upcoming'

export function progressStates(status: ChangeOrderStatus): ProgressStepState[] {
  const index = status === 'approved' || status === 'rejected' ? 3 : status === 'void' ? -1 : CHANGE_ORDER_PROGRESS.findIndex((s) => s.key === status)
  return CHANGE_ORDER_PROGRESS.map((_, i) => {
    if (index === -1) return 'upcoming'
    if (i < index || (i === 3 && index === 3)) return 'complete'
    return i === index ? 'current' : 'upcoming'
  })
}

export type ChangeOrderSummaryRow = {
  status: ChangeOrderStatus
  price_adjustment_cents: number
  cost_adjustment_cents: number
  schedule_impact_days: number | null
}

export function isPendingStatus(status: ChangeOrderStatus) {
  return status === 'internal_review' || status === 'awaiting_homeowner'
}

/**
 * Totals for the overview. Approved and pending are disjoint by status, so a row is counted at most once.
 * Drafts, rejected and void rows contribute nothing.
 */
export function summarizeChangeOrders(rows: ChangeOrderSummaryRow[]) {
  const summary = {
    approvedCount: 0,
    pendingCount: 0,
    approvedPriceCents: 0,
    approvedCostCents: 0,
    pendingPriceCents: 0,
    approvedScheduleDays: 0,
    approvedWithScheduleCount: 0,
  }
  for (const r of rows) {
    if (r.status === 'approved') {
      summary.approvedCount++
      summary.approvedPriceCents += r.price_adjustment_cents
      summary.approvedCostCents += r.cost_adjustment_cents
      if (r.schedule_impact_days !== null) {
        summary.approvedScheduleDays += r.schedule_impact_days
        summary.approvedWithScheduleCount++
      }
    } else if (isPendingStatus(r.status)) {
      summary.pendingCount++
      summary.pendingPriceCents += r.price_adjustment_cents
    }
  }
  return summary
}

export function formatScheduleDays(days: number | null, style: 'short' | 'long' = 'short') {
  if (days === null) return style === 'short' ? '—' : 'Not set'
  const sign = days > 0 ? '+' : ''
  if (style === 'short') return `${sign}${days}d`
  return `${sign}${days} ${Math.abs(days) === 1 ? 'day' : 'days'}`
}

export type DirectoryRow = ChangeOrderSummaryRow & { id: string; co_number: string; number: number; title: string; updated_at: string }
export type DirectorySort = 'number_desc' | 'number_asc' | 'updated_desc' | 'price_desc' | 'price_asc'
export type DirectoryStatusFilter = 'all' | 'open' | ChangeOrderStatus

export function filterAndSortChangeOrders<T extends DirectoryRow>(rows: T[], q: string, status: DirectoryStatusFilter, sort: DirectorySort): T[] {
  const needle = q.trim().toLowerCase()
  const filtered = rows.filter((r) => {
    if (status === 'open' && !(r.status === 'draft' || isPendingStatus(r.status))) return false
    if (status !== 'all' && status !== 'open' && r.status !== status) return false
    return !needle || r.title.toLowerCase().includes(needle) || r.co_number.toLowerCase().includes(needle)
  })
  const compare: Record<DirectorySort, (a: T, b: T) => number> = {
    number_desc: (a, b) => b.number - a.number,
    number_asc: (a, b) => a.number - b.number,
    updated_desc: (a, b) => b.updated_at.localeCompare(a.updated_at),
    price_desc: (a, b) => b.price_adjustment_cents - a.price_adjustment_cents,
    price_asc: (a, b) => a.price_adjustment_cents - b.price_adjustment_cents,
  }
  return [...filtered].sort(compare[sort])
}

export const CHANGE_ORDER_DECISION_METHODS = [
  { value: 'in_person', label: 'In person' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'paper_signature', label: 'Paper signature' },
  { value: 'electronic_signature', label: 'Electronic signature' },
  { value: 'other', label: 'Other' },
] as const

export function isChangeOrderStatus(value: unknown): value is ChangeOrderStatus {
  return typeof value === 'string' && (CHANGE_ORDER_STATUSES as readonly string[]).includes(value)
}

export function isEditableStatus(status: ChangeOrderStatus) {
  return status === 'draft' || status === 'internal_review'
}

/** Transitions offered in the UI; mirrors the database guard, which remains authoritative. */
export function allowedTransitions(status: ChangeOrderStatus): ChangeOrderStatus[] {
  switch (status) {
    case 'draft':
      return ['internal_review', 'void']
    case 'internal_review':
      return ['draft', 'awaiting_homeowner', 'void']
    case 'awaiting_homeowner':
      return ['draft', 'approved', 'rejected', 'void']
    default:
      return []
  }
}

export type LineInput = { category: string; description: string; quantity: string; unit: string; unit_cost: string }
export type ParsedLine = { category: string; description: string; quantity: string; unit: string; unit_cost_cents: number; cost_cents: number }

export const MAX_LINES = 200

/** Validates raw line rows. Blank rows are dropped; errors are keyed `lines.<index>.<field>`. */
export function parseLines(rows: LineInput[]): { lines: ParsedLine[]; errors: Record<string, string> } {
  const lines: ParsedLine[] = []
  const errors: Record<string, string> = {}
  rows.forEach((row, i) => {
    const description = (row.description ?? '').trim()
    const unitCostRaw = (row.unit_cost ?? '').trim()
    if (!description && !unitCostRaw) return
    const key = (f: string) => `lines.${i}.${f}`
    if (!(ESTIMATE_CATEGORIES as readonly string[]).includes(row.category)) errors[key('category')] = 'Choose a category'
    if (!description) errors[key('description')] = 'Describe this line'
    else if (description.length > 300) errors[key('description')] = 'Keep under 300 characters'
    const quantityMilli = parseQuantityMilli(row.quantity ?? '')
    if (quantityMilli === null) errors[key('quantity')] = 'Enter a quantity like 2 or 1.5'
    const unit = (row.unit ?? '').trim() || 'ea'
    if (unit.length > 20) errors[key('unit')] = 'Keep under 20 characters'
    const unitCost = parseSignedDollarsToCents(unitCostRaw || '0')
    if (unitCost === null) errors[key('unit_cost')] = 'Enter a dollar amount; use a minus sign for credits'
    if (quantityMilli !== null && unitCost !== null) {
      lines.push({
        category: row.category,
        description,
        quantity: (quantityMilli / 1000).toString(),
        unit,
        unit_cost_cents: unitCost,
        cost_cents: lineCostCents(quantityMilli, unitCost),
      })
    }
  })
  if (lines.length > MAX_LINES) errors.lines = `Use at most ${MAX_LINES} lines`
  return { lines, errors }
}

export function sumLineCosts(lines: Pick<ParsedLine, 'cost_cents'>[]) {
  return lines.reduce((total, l) => total + l.cost_cents, 0)
}

export function changeOrdersPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/change-orders`
}

export function changeOrderPath(projectId: string, changeOrderId: string) {
  return `${changeOrdersPath(projectId)}/${encodeURIComponent(changeOrderId)}`
}
