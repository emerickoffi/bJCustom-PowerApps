/**
 * How much can still be billed against an approved estimate. Mirrors public.estimate_billing_limit, which is the
 * check that actually blocks over-billing when an invoice is issued; this copy only drives what the form shows.
 *
 * - With exactly one approved estimate family on the project (an established baseline, as in lib/financials),
 *   the limit is that family's latest approved total plus the price adjustments of approved change orders, and
 *   billing counts issued invoices on every revision of the family.
 * - Otherwise the limit is the estimate's own total, and only invoices on that estimate count.
 * All amounts are integer cents.
 */

export type BillingEstimate = {
  id: string
  project_id: string
  family_id: string
  revision: number
  construction_total_cents: number
}

export type BilledInvoice = { id: string; estimate_id: string; subtotal_cents: number }
export type ProjectChangeOrder = { project_id: string; status: string; price_adjustment_cents: number }

export type BillingLimit = {
  estimateCents: number
  changeOrderCents: number
  limitCents: number
  billedCents: number
  remainingCents: number
}

export function billingLimits(
  approvedEstimates: BillingEstimate[],
  billed: BilledInvoice[],
  changeOrders: ProjectChangeOrder[],
  excludeInvoiceId?: string,
): Map<string, BillingLimit> {
  const byId = new Map(approvedEstimates.map((e) => [e.id, e]))
  const familiesByProject = new Map<string, Set<string>>()
  const latestByFamily = new Map<string, BillingEstimate>()
  for (const e of approvedEstimates) {
    const set = familiesByProject.get(e.project_id) ?? new Set<string>()
    set.add(e.family_id)
    familiesByProject.set(e.project_id, set)
    const latest = latestByFamily.get(e.family_id)
    if (!latest || e.revision > latest.revision) latestByFamily.set(e.family_id, e)
  }

  const coByProject = new Map<string, number>()
  for (const c of changeOrders) {
    if (c.status !== 'approved') continue
    coByProject.set(c.project_id, (coByProject.get(c.project_id) ?? 0) + c.price_adjustment_cents)
  }

  const billedByEstimate = new Map<string, number>()
  const billedByFamily = new Map<string, number>()
  for (const inv of billed) {
    if (inv.id === excludeInvoiceId) continue
    billedByEstimate.set(inv.estimate_id, (billedByEstimate.get(inv.estimate_id) ?? 0) + inv.subtotal_cents)
    const est = byId.get(inv.estimate_id)
    if (est) billedByFamily.set(est.family_id, (billedByFamily.get(est.family_id) ?? 0) + inv.subtotal_cents)
  }

  const result = new Map<string, BillingLimit>()
  for (const e of approvedEstimates) {
    const established = (familiesByProject.get(e.project_id)?.size ?? 0) === 1
    const estimateCents = established ? latestByFamily.get(e.family_id)!.construction_total_cents : e.construction_total_cents
    const changeOrderCents = established ? (coByProject.get(e.project_id) ?? 0) : 0
    const billedCents = established ? (billedByFamily.get(e.family_id) ?? 0) : (billedByEstimate.get(e.id) ?? 0)
    const limitCents = estimateCents + changeOrderCents
    result.set(e.id, { estimateCents, changeOrderCents, limitCents, billedCents, remainingCents: Math.max(limitCents - billedCents, 0) })
  }
  return result
}
