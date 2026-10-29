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

export const CHANGE_ORDER_STATUS_TONES: Record<ChangeOrderStatus, 'neutral' | 'sage' | 'primary' | 'warning' | 'danger' | 'champagne'> = {
  draft: 'neutral',
  internal_review: 'sage',
  awaiting_homeowner: 'warning',
  approved: 'primary',
  rejected: 'danger',
  void: 'neutral',
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
