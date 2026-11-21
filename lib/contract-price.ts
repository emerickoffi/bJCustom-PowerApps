/**
 * The homeowner's price, the way builders talk about it: original price (approved estimate) plus approved change
 * orders = contract price; then what has been billed, what is left to bill, and what is still owed.
 * Same rules as invoice billing limits (estimate construction total + approved change-order prices; billed = invoice
 * subtotals before tax on non-draft, non-voided invoices), so the numbers agree with the New invoice screen.
 */

export type ContractPriceInput = {
  /** Approved estimate construction total, or null when nothing is approved yet. */
  estimateCents: number | null
  changeOrders: { status: string; price_adjustment_cents: number | null }[]
  invoices: { status: string; subtotal_cents: number | null; total_cents: number; paid_cents: number; due_date: string }[]
  /** Selections waiting on a change order (picked over their allowance). */
  selectionsNeedingChangeOrder?: number
  today: string
}

export type ContractPriceSummary = {
  originalCents: number | null
  approvedChangeCents: number
  approvedChangeCount: number
  pendingChangeCents: number
  pendingChangeCount: number
  contractCents: number | null
  billedCents: number
  leftToBillCents: number | null
  paidCents: number
  balanceDueCents: number
  overdueCount: number
  overdueCents: number
  selectionsNeedingChangeOrder: number
}

const PENDING_CHANGE = new Set(['draft', 'internal_review', 'awaiting_homeowner'])
const ACTIVE_INVOICE = new Set(['issued', 'partially_paid', 'paid'])

export function summarizeContractPrice(input: ContractPriceInput): ContractPriceSummary {
  let approvedChangeCents = 0
  let approvedChangeCount = 0
  let pendingChangeCents = 0
  let pendingChangeCount = 0
  for (const co of input.changeOrders) {
    const amount = co.price_adjustment_cents ?? 0
    if (co.status === 'approved') {
      approvedChangeCents += amount
      approvedChangeCount += 1
    } else if (PENDING_CHANGE.has(co.status)) {
      pendingChangeCents += amount
      pendingChangeCount += 1
    }
  }

  let billedCents = 0
  let paidCents = 0
  let balanceDueCents = 0
  let overdueCount = 0
  let overdueCents = 0
  for (const inv of input.invoices) {
    if (!ACTIVE_INVOICE.has(inv.status)) continue
    billedCents += inv.subtotal_cents ?? inv.total_cents
    paidCents += inv.paid_cents
    const balance = Math.max(0, inv.total_cents - inv.paid_cents)
    balanceDueCents += balance
    if (balance > 0 && inv.status !== 'paid' && inv.due_date < input.today) {
      overdueCount += 1
      overdueCents += balance
    }
  }

  const contractCents = input.estimateCents === null ? null : input.estimateCents + approvedChangeCents
  return {
    originalCents: input.estimateCents,
    approvedChangeCents,
    approvedChangeCount,
    pendingChangeCents,
    pendingChangeCount,
    contractCents,
    billedCents,
    leftToBillCents: contractCents === null ? null : contractCents - billedCents,
    paidCents,
    balanceDueCents,
    overdueCount,
    overdueCents,
    selectionsNeedingChangeOrder: input.selectionsNeedingChangeOrder ?? 0,
  }
}
