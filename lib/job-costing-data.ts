import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { resolveBaseline, summarizeBudget, type Baseline, type BaselineCandidate, type BudgetSummary } from '@/lib/financials'
import { summarizeJobCost, type CostTrackingInput, type JobCostSummary } from '@/lib/job-costing'
import { isMissingTableError } from '@/lib/subcontractors'

export type ProjectFinancials = {
  baseline: Baseline
  budget: BudgetSummary
  summary: JobCostSummary
}

const n = (v: unknown) => Number(v ?? 0)

/** Loads cost-tracking records; returns null when the job-costing migration is not installed in this environment. */
async function loadCostTracking(projectId: string): Promise<CostTrackingInput | null> {
  const supabase = await createClient()
  const [commitments, bills, payments, forecasts] = await Promise.all([
    supabase.from('project_commitments').select('id, cost_category, status, amount_cents').eq('project_id', projectId),
    supabase.from('vendor_bills').select('id, commitment_id, cost_category, status, amount_cents').eq('project_id', projectId),
    supabase.from('vendor_payments').select('bill_id, amount_cents, reversed_at').eq('project_id', projectId),
    supabase.from('project_cost_forecasts').select('cost_category, etc_cents').eq('project_id', projectId),
  ])
  const results = [commitments, bills, payments, forecasts]
  if (results.some((r) => isMissingTableError(r.error))) return null
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(`Job cost records could not be loaded: ${failed.error.message}`)

  const billedByCommitment = new Map<string, number>()
  for (const b of bills.data ?? []) {
    if (b.status === 'approved' && b.commitment_id) {
      billedByCommitment.set(b.commitment_id, (billedByCommitment.get(b.commitment_id) ?? 0) + n(b.amount_cents))
    }
  }
  return {
    commitments: (commitments.data ?? []).map((c) => ({
      category: c.cost_category,
      status: c.status,
      amount_cents: n(c.amount_cents),
      billed_cents: billedByCommitment.get(c.id) ?? 0,
    })),
    bills: (bills.data ?? []).map((b) => ({ id: b.id, category: b.cost_category, status: b.status, amount_cents: n(b.amount_cents) })),
    payments: (payments.data ?? []).map((p) => ({ bill_id: p.bill_id, amount_cents: n(p.amount_cents), reversed: p.reversed_at !== null })),
    forecasts: (forecasts.data ?? []).map((f) => ({ category: f.cost_category, etc_cents: n(f.etc_cents) })),
  }
}

export async function loadProjectFinancials(projectId: string): Promise<ProjectFinancials> {
  const supabase = await createClient()
  const [estimates, changeOrders, invoices, costTracking] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, family_id, revision, status, estimate_number, decision_at, direct_cost_cents, allowance_cents, contingency_cents, markup_cents, construction_total_cents')
      .eq('project_id', projectId),
    supabase.from('change_orders').select('id, status, cost_adjustment_cents, price_adjustment_cents').eq('project_id', projectId),
    supabase.from('invoices').select('status, total_cents, paid_cents').eq('project_id', projectId),
    loadCostTracking(projectId),
  ])
  for (const r of [estimates, changeOrders, invoices]) {
    if (r.error) throw new Error(`Project financials could not be loaded: ${r.error.message}`)
  }

  const candidates: BaselineCandidate[] = (estimates.data ?? []).map((e) => ({
    ...e,
    revision: n(e.revision),
    direct_cost_cents: n(e.direct_cost_cents),
    allowance_cents: n(e.allowance_cents),
    contingency_cents: n(e.contingency_cents),
    markup_cents: n(e.markup_cents),
    construction_total_cents: n(e.construction_total_cents),
  }))
  const baseline = resolveBaseline(candidates)
  const cos = (changeOrders.data ?? []).map((c) => ({
    id: c.id,
    status: c.status,
    cost_adjustment_cents: n(c.cost_adjustment_cents),
    price_adjustment_cents: n(c.price_adjustment_cents),
  }))
  const budget = summarizeBudget(baseline, cos)
  const approvedIds = cos.filter((c) => c.status === 'approved').map((c) => c.id)

  const [baselineLines, coLines] = await Promise.all([
    baseline.state === 'established'
      ? supabase.from('estimate_line_items').select('category, line_total_cents').eq('estimate_id', baseline.estimate.id)
      : Promise.resolve({ data: [], error: null }),
    approvedIds.length > 0
      ? supabase.from('change_order_line_items').select('category, cost_cents').in('change_order_id', approvedIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (baselineLines.error || coLines.error) throw new Error('Budget line items could not be loaded.')

  const summary = summarizeJobCost({
    baseline:
      baseline.state === 'established'
        ? {
            established: true,
            lines: (baselineLines.data ?? []).map((l: { category: string; line_total_cents: unknown }) => ({ category: l.category, cost_cents: n(l.line_total_cents) })),
            contingencyCents: baseline.estimate.contingency_cents,
            originalCostCents: baseline.originalCostCents,
            contractPriceCents: baseline.contractPriceCents,
          }
        : { established: false },
    approvedChangeOrderLines: (coLines.data ?? []).map((l: { category: string; cost_cents: unknown }) => ({ category: l.category, cost_cents: n(l.cost_cents) })),
    approvedPriceAdjustmentsCents: budget.approvedPriceAdjustmentsCents,
    invoices: (invoices.data ?? []).map((i) => ({ status: i.status, total_cents: n(i.total_cents), paid_cents: n(i.paid_cents) })),
    costTracking,
  })

  return { baseline, budget, summary }
}
