/**
 * Phase 7b staff entry rules for commitments, vendor bills and vendor payments.
 * Pure and integer-cent only. The database enforces the same rules; these give fast, field-level feedback.
 */
import { ESTIMATE_CATEGORIES } from './estimates.ts'
import { CONTINGENCY_CATEGORY } from './job-costing.ts'

export const COST_CATEGORY_OPTIONS = [...ESTIMATE_CATEGORIES, CONTINGENCY_CATEGORY] as const

export const PAYMENT_METHODS = [
  { value: 'check', label: 'Check' },
  { value: 'ach', label: 'ACH' },
  { value: 'wire', label: 'Wire' },
  { value: 'card', label: 'Card' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]['value']

export const MAX_AMOUNT_CENTS = 100_000_000_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Parses a positive dollar amount ("1,234.56", "$80") into cents. Null when invalid, zero, negative or over two decimals. */
export function parsePositiveDollarsToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > MAX_AMOUNT_CENTS) return null
  return cents
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

type Errors = Record<string, string>
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export type BillInput = {
  vendorName: string
  billNumber: string | null
  billDate: string
  dueDate: string | null
  description: string
  amountCents: number
  category: string
  commitmentId: string | null
  notes: string | null
  attachmentDocumentId: string | null
}

export function validateBill(
  values: Record<string, string | undefined>,
  commitments: { id: string; category: string }[] = [],
): { ok: true; data: BillInput } | { ok: false; errors: Errors } {
  const errors: Errors = {}
  const vendorName = str(values.vendor_name)
  const billNumber = str(values.bill_number)
  const billDate = str(values.bill_date)
  const dueDate = str(values.due_date)
  const description = str(values.description)
  const notes = str(values.notes)
  const category = str(values.cost_category)
  const commitmentId = str(values.commitment_id)
  const attachment = str(values.attachment_document_id)
  const amountCents = parsePositiveDollarsToCents(str(values.amount))

  if (!vendorName) errors.vendor_name = 'Enter the vendor or subcontractor'
  else if (vendorName.length > 160) errors.vendor_name = 'Keep the vendor name under 160 characters'
  if (billNumber.length > 60) errors.bill_number = 'Keep the invoice number under 60 characters'
  if (!billDate) errors.bill_date = 'Enter the invoice date'
  else if (!isIsoDate(billDate)) errors.bill_date = 'Enter a valid date'
  if (dueDate && !isIsoDate(dueDate)) errors.due_date = 'Enter a valid date'
  else if (dueDate && billDate && isIsoDate(billDate) && dueDate < billDate) errors.due_date = 'Due date cannot be before the invoice date'
  if (description.length < 2) errors.description = 'Describe what this bill covers'
  else if (description.length > 500) errors.description = 'Keep the description under 500 characters'
  if (notes.length > 2000) errors.notes = 'Keep notes under 2,000 characters'
  if (amountCents === null) errors.amount = 'Enter an amount greater than $0.00'
  if (!(COST_CATEGORY_OPTIONS as readonly string[]).includes(category)) errors.cost_category = 'Choose a cost category'
  if (commitmentId) {
    const c = commitments.find((x) => x.id === commitmentId)
    if (!c) errors.commitment_id = 'Choose an approved commitment on this project'
    else if (!errors.cost_category && c.category !== category) errors.cost_category = `Must match the linked commitment (${c.category})`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    data: {
      vendorName,
      billNumber: billNumber || null,
      billDate,
      dueDate: dueDate || null,
      description,
      amountCents: amountCents!,
      category,
      commitmentId: commitmentId || null,
      notes: notes || null,
      attachmentDocumentId: attachment || null,
    },
  }
}

export type CommitmentInput = { vendorName: string; description: string; amountCents: number; category: string; notes: string | null }

export function validateCommitment(values: Record<string, string | undefined>): { ok: true; data: CommitmentInput } | { ok: false; errors: Errors } {
  const errors: Errors = {}
  const vendorName = str(values.vendor_name)
  const description = str(values.description)
  const category = str(values.cost_category)
  const notes = str(values.notes)
  const amountCents = parsePositiveDollarsToCents(str(values.amount))
  if (!vendorName) errors.vendor_name = 'Enter the vendor or subcontractor'
  else if (vendorName.length > 160) errors.vendor_name = 'Keep the vendor name under 160 characters'
  if (description.length < 2) errors.description = 'Describe the scope committed'
  else if (description.length > 500) errors.description = 'Keep the description under 500 characters'
  if (notes.length > 2000) errors.notes = 'Keep notes under 2,000 characters'
  if (amountCents === null) errors.amount = 'Enter an amount greater than $0.00'
  if (!(COST_CATEGORY_OPTIONS as readonly string[]).includes(category)) errors.cost_category = 'Choose a cost category'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, data: { vendorName, description, amountCents: amountCents!, category, notes: notes || null } }
}

export type PaymentInput = { paymentDate: string; amountCents: number; method: PaymentMethod; reference: string | null; notes: string | null }

export function validatePayment(
  values: Record<string, string | undefined>,
  balanceCents: number,
): { ok: true; data: PaymentInput } | { ok: false; errors: Errors } {
  const errors: Errors = {}
  const paymentDate = str(values.payment_date)
  const method = str(values.method)
  const reference = str(values.reference)
  const notes = str(values.notes)
  const amountCents = parsePositiveDollarsToCents(str(values.amount))
  if (!paymentDate) errors.payment_date = 'Enter the payment date'
  else if (!isIsoDate(paymentDate)) errors.payment_date = 'Enter a valid date'
  if (amountCents === null) errors.amount = 'Enter an amount greater than $0.00'
  else if (amountCents > balanceCents) errors.amount = 'Payment cannot exceed the unpaid balance'
  if (!PAYMENT_METHODS.some((m) => m.value === method)) errors.method = 'Choose a payment method'
  if (reference.length > 120) errors.reference = 'Keep the reference under 120 characters'
  if (notes.length > 1000) errors.notes = 'Keep notes under 1,000 characters'
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, data: { paymentDate, amountCents: amountCents!, method: method as PaymentMethod, reference: reference || null, notes: notes || null } }
}

export type BillDisplayStatus = 'draft' | 'approved' | 'partially_paid' | 'paid' | 'overdue' | 'voided'

export const BILL_STATUS_LABELS: Record<BillDisplayStatus, string> = {
  draft: 'Awaiting approval',
  approved: 'Unpaid',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  voided: 'Voided',
}

export type BillBalance = { paidCents: number; balanceCents: number; status: BillDisplayStatus }

/** Paid and remaining balance from non-reversed payments, plus a display status. `today` is a YYYY-MM-DD string. */
export function billBalance(
  bill: { status: string; amount_cents: number; due_date: string | null },
  payments: { amount_cents: number; reversed: boolean }[],
  today: string,
): BillBalance {
  const paidCents = payments.reduce((t, p) => (p.reversed ? t : t + p.amount_cents), 0)
  const balanceCents = Math.max(bill.amount_cents - paidCents, 0)
  if (bill.status === 'voided') return { paidCents, balanceCents: 0, status: 'voided' }
  if (bill.status !== 'approved') return { paidCents, balanceCents: bill.amount_cents, status: 'draft' }
  if (balanceCents === 0) return { paidCents, balanceCents, status: 'paid' }
  if (bill.due_date && bill.due_date < today) return { paidCents, balanceCents, status: 'overdue' }
  return { paidCents, balanceCents, status: paidCents > 0 ? 'partially_paid' : 'approved' }
}

/** Billed against a commitment counts approved bills only, matching job-costing actual cost. */
export function commitmentBilledCents(commitmentId: string, bills: { commitment_id: string | null; status: string; amount_cents: number }[]): number {
  return bills.reduce((t, b) => (b.commitment_id === commitmentId && b.status === 'approved' ? t + b.amount_cents : t), 0)
}

export type BillsOverview = { awaitingApprovalCount: number; unpaidCents: number; overdueCents: number; overdueCount: number; paidCents: number }

export function summarizeBills(balances: BillBalance[]): BillsOverview {
  const o: BillsOverview = { awaitingApprovalCount: 0, unpaidCents: 0, overdueCents: 0, overdueCount: 0, paidCents: 0 }
  for (const b of balances) {
    if (b.status === 'voided') continue
    if (b.status === 'draft') {
      o.awaitingApprovalCount += 1
      continue
    }
    o.unpaidCents += b.balanceCents
    o.paidCents += b.paidCents
    if (b.status === 'overdue') {
      o.overdueCents += b.balanceCents
      o.overdueCount += 1
    }
  }
  return o
}
