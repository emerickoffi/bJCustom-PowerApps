import type { StatusTone } from '@/components/shared/status-badge'

export const INVOICE_STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'voided'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  voided: 'Voided',
}

export const INVOICE_STATUS_TONES: Record<InvoiceStatus, StatusTone> = {
  draft: 'neutral',
  issued: 'warning',
  partially_paid: 'champagne',
  paid: 'solid',
  voided: 'danger',
}

export const DRAW_MILESTONES = [
  'deposit',
  'foundation',
  'framing',
  'roofing',
  'mechanical',
  'drywall',
  'finishes',
  'final',
  'other',
] as const
export type DrawMilestone = (typeof DRAW_MILESTONES)[number]

export const DRAW_MILESTONE_LABELS: Record<DrawMilestone, string> = {
  deposit: 'Deposit',
  foundation: 'Foundation',
  framing: 'Framing',
  roofing: 'Roofing / dry-in',
  mechanical: 'Mechanical rough-in',
  drywall: 'Drywall',
  finishes: 'Finishes',
  final: 'Final / closeout',
  other: 'Other milestone',
}

export const PAYMENT_METHODS = ['check', 'ach', 'wire', 'cash', 'card_offline', 'financing', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  check: 'Check',
  ach: 'ACH / bank transfer',
  wire: 'Wire',
  cash: 'Cash',
  card_offline: 'Card (processed outside this app)',
  financing: 'Lender / construction loan draw',
  other: 'Other',
}

export const INVOICE_EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  issued: 'Issued',
  published: 'Published to portal',
  unpublished: 'Hidden from portal',
  payment_recorded: 'Payment recorded',
  payment_reversed: 'Payment reversed',
  voided: 'Voided',
}

export type InvoiceLineInput = {
  description: string
  quantity: string
  unitRate: string
  taxable: boolean
}

/** Parses a dollar string into integer cents without floating-point arithmetic. */
export function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Mirrors the database math so the editor preview matches the saved totals exactly. */
export function computeInvoiceTotals(lines: InvoiceLineInput[], taxPercent: string) {
  let subtotal = 0
  let taxable = 0
  for (const line of lines) {
    const qty = Number(line.quantity)
    const rate = dollarsToCents(line.unitRate)
    if (!Number.isFinite(qty) || qty <= 0 || rate === null) continue
    const amount = Math.round(qty * rate)
    subtotal += amount
    if (line.taxable) taxable += amount
  }
  const pct = Number(taxPercent) || 0
  const tax = Math.round((taxable * pct) / 100)
  return { subtotal, taxable, tax, total: subtotal + tax }
}

export function balanceCents(invoice: { total_cents: number; paid_cents: number; status: InvoiceStatus }) {
  return invoice.status === 'voided' ? 0 : invoice.total_cents - invoice.paid_cents
}

export function isOverdue(invoice: { due_date: string; status: InvoiceStatus }) {
  if (invoice.status !== 'issued' && invoice.status !== 'partially_paid') return false
  return invoice.due_date < new Date().toISOString().slice(0, 10)
}
