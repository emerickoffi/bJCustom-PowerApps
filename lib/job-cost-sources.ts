/**
 * Source records behind each Budget & costs amount. Pure and integer-cent only.
 *
 * The inclusion rules here MUST stay identical to `summarizeJobCost` in ./job-costing.ts, which remains the authoritative
 * calculation. `job-cost-sources.test.ts` asserts every category's contributions reconcile to its table amounts.
 */
import { formatMoney } from './financials.ts'
import { CONTINGENCY_CATEGORY, UNALLOCATED_CATEGORY } from './job-costing.ts'

export type SourceRow = {
  id: string
  reference: string
  description: string
  vendor: string | null
  date: string | null
  status: string
  amountCents: number
  /** Canonical record a manager can open, when one exists in the app. */
  href: string | null
  note?: string
}

export type ExcludedRow = SourceRow & { reason: string }

export type CategorySources = {
  baseline: SourceRow[]
  approvedChanges: SourceRow[]
  pendingChanges: SourceRow[]
  committed: SourceRow[]
  actual: SourceRow[]
  paid: SourceRow[]
  excluded: { committed: ExcludedRow[]; actual: ExcludedRow[]; paid: ExcludedRow[] }
}

export type SourceInput = {
  projectId: string
  baseline:
    | {
        established: true
        estimate: { id: string; number: string; revision: number; decisionAt: string | null }
        lines: { id: string; category: string; description: string; cost_cents: number }[]
        contingencyCents: number
        originalCostCents: number
      }
    | { established: false }
  changeOrders: { id: string; number: string; title: string; status: string; decisionAt: string | null }[]
  changeOrderLines: { id: string; change_order_id: string; category: string; description: string; cost_cents: number }[]
  costTracking: {
    commitments: { id: string; category: string; status: string; amount_cents: number; vendor: string; description: string; type: string; date: string }[]
    bills: { id: string; commitment_id: string | null; category: string; status: string; amount_cents: number; vendor: string; number: string | null; description: string; date: string }[]
    payments: { id: string; bill_id: string; amount_cents: number; reversed: boolean; date: string; method: string; reference: string | null }[]
  } | null
}

/** Mirrors the pending set in lib/financials.ts summarizeBudget. */
export const PENDING_CHANGE_STATUSES = new Set(['draft', 'internal_review', 'awaiting_homeowner'])

const empty = (): CategorySources => ({
  baseline: [],
  approvedChanges: [],
  pendingChanges: [],
  committed: [],
  actual: [],
  paid: [],
  excluded: { committed: [], actual: [], paid: [] },
})

export function buildCategorySources(input: SourceInput): Record<string, CategorySources> {
  const out: Record<string, CategorySources> = {}
  const at = (category: string) => (out[category] ??= empty())
  const coHref = (id: string) => `/projects/${encodeURIComponent(input.projectId)}/change-orders/${encodeURIComponent(id)}`
  const estimatesHref = `/projects/${encodeURIComponent(input.projectId)}/estimates`

  if (input.baseline.established) {
    const b = input.baseline
    const ref = `${b.estimate.number || 'Estimate'} rev ${b.estimate.revision}`
    let allocated = 0
    for (const l of b.lines) {
      at(l.category).baseline.push({ id: l.id, reference: ref, description: l.description, vendor: null, date: b.estimate.decisionAt, status: 'approved', amountCents: l.cost_cents, href: estimatesHref })
      allocated += l.cost_cents
    }
    if (b.contingencyCents !== 0) {
      at(CONTINGENCY_CATEGORY).baseline.push({ id: `${b.estimate.id}:contingency`, reference: ref, description: 'Estimate contingency', vendor: null, date: b.estimate.decisionAt, status: 'approved', amountCents: b.contingencyCents, href: estimatesHref })
    }
    allocated += b.contingencyCents
    const diff = b.originalCostCents - allocated
    if (diff !== 0) {
      at(UNALLOCATED_CATEGORY).baseline.push({
        id: `${b.estimate.id}:unallocated`,
        reference: ref,
        description: 'Difference between the approved estimate cost total and its line items',
        vendor: null,
        date: b.estimate.decisionAt,
        status: 'approved',
        amountCents: diff,
        href: estimatesHref,
      })
    }
  }

  const coById = new Map(input.changeOrders.map((co) => [co.id, co]))
  for (const l of input.changeOrderLines) {
    const co = coById.get(l.change_order_id)
    if (!co) continue
    const row: SourceRow = { id: l.id, reference: co.number, description: `${co.title}: ${l.description}`, vendor: null, date: co.decisionAt, status: co.status, amountCents: l.cost_cents, href: coHref(co.id) }
    // Approved change-order cost only adjusts an established baseline, matching summarizeJobCost.
    if (co.status === 'approved' && input.baseline.established) at(l.category).approvedChanges.push(row)
    else if (PENDING_CHANGE_STATUSES.has(co.status)) at(l.category).pendingChanges.push(row)
  }

  const t = input.costTracking
  if (t) {
    const billedByCommitment = new Map<string, number>()
    for (const b of t.bills) {
      if (b.status === 'approved' && b.commitment_id) billedByCommitment.set(b.commitment_id, (billedByCommitment.get(b.commitment_id) ?? 0) + b.amount_cents)
    }
    for (const c of t.commitments) {
      const billed = Math.min(billedByCommitment.get(c.id) ?? 0, c.amount_cents)
      const base = { id: c.id, reference: c.type.replace('_', ' '), description: c.description, vendor: c.vendor, date: c.date, status: c.status, href: null }
      if (c.status === 'approved') at(c.category).committed.push({ ...base, amountCents: c.amount_cents })
      else if (c.status === 'closed') at(c.category).committed.push({ ...base, amountCents: billed, note: `Closed. Unbilled ${fmt(c.amount_cents - billed)} released.` })
      else at(c.category).excluded.committed.push({ ...base, amountCents: c.amount_cents, reason: c.status === 'draft' ? 'Draft, not approved' : 'Cancelled' })
    }

    const approvedBills = new Map<string, { category: string; label: string }>()
    for (const b of t.bills) {
      const row = { id: b.id, reference: b.number || 'Bill', description: b.description, vendor: b.vendor, date: b.date, status: b.status, amountCents: b.amount_cents, href: null }
      if (b.status === 'approved') {
        at(b.category).actual.push(row)
        approvedBills.set(b.id, { category: b.category, label: `${b.number || 'Bill'} · ${b.vendor}` })
      } else {
        at(b.category).excluded.actual.push({ ...row, reason: b.status === 'draft' ? 'Draft, awaiting approval' : 'Voided' })
      }
    }
    for (const p of t.payments) {
      const bill = approvedBills.get(p.bill_id)
      if (!bill) continue
      const row = { id: p.id, reference: p.reference || p.method.toUpperCase(), description: `Payment on ${bill.label}`, vendor: null, date: p.date, status: p.reversed ? 'reversed' : 'recorded', amountCents: p.amount_cents, href: null }
      if (p.reversed) at(bill.category).excluded.paid.push({ ...row, reason: 'Reversed' })
      else at(bill.category).paid.push(row)
    }
  }

  return out
}

export const sumCents = (rows: { amountCents: number }[]) => rows.reduce((t, r) => t + r.amountCents, 0)

const fmt = (cents: number) => formatMoney(cents)
