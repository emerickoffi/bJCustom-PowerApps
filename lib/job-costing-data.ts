import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { resolveBaseline, summarizeBudget, type Baseline, type BaselineCandidate, type BudgetSummary } from '@/lib/financials'
import { summarizeJobCost, type CostTrackingInput, type JobCostSummary } from '@/lib/job-costing'
import { buildCategorySources, PENDING_CHANGE_STATUSES, type CategorySources, type SourceInput } from '@/lib/job-cost-sources'
import { isMissingTableError } from '@/lib/subcontractors'

export type ProjectFinancials = {
  baseline: Baseline
  budget: BudgetSummary
  summary: JobCostSummary
  /** Records behind each category amount, built from the same rows as `summary`. */
  sources: Record<string, CategorySources>
}

const n = (v: unknown) => Number(v ?? 0)

/** Loads cost-tracking records; returns null when the job-costing migration is not installed in this environment. */
async function loadCostTracking(projectId: string): Promise<{ input: CostTrackingInput; records: NonNullable<SourceInput['costTracking']> } | null> {
  const supabase = await createClient()
  const [commitments, bills, payments, forecasts] = await Promise.all([
    supabase.from('project_commitments').select('id, cost_category, status, amount_cents, vendor_name, description, commitment_type, effective_date').eq('project_id', projectId),
    supabase.from('vendor_bills').select('id, commitment_id, cost_category, status, amount_cents, vendor_name, bill_number, description, bill_date').eq('project_id', projectId),
    supabase.from('vendor_payments').select('id, bill_id, amount_cents, reversed_at, payment_date, method, reference').eq('project_id', projectId),
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
  const input: CostTrackingInput = {
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
  const records: NonNullable<SourceInput['costTracking']> = {
    commitments: (commitments.data ?? []).map((c) => ({
      id: c.id,
      category: c.cost_category,
      status: c.status,
      amount_cents: n(c.amount_cents),
      vendor: c.vendor_name,
      description: c.description,
      type: c.commitment_type,
      date: c.effective_date,
    })),
    bills: (bills.data ?? []).map((b) => ({
      id: b.id,
      commitment_id: b.commitment_id,
      category: b.cost_category,
      status: b.status,
      amount_cents: n(b.amount_cents),
      vendor: b.vendor_name,
      number: b.bill_number,
      description: b.description,
      date: b.bill_date,
    })),
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      bill_id: p.bill_id,
      amount_cents: n(p.amount_cents),
      reversed: p.reversed_at !== null,
      date: p.payment_date,
      method: p.method,
      reference: p.reference,
    })),
  }
  return { input, records }
}

export async function loadProjectFinancials(projectId: string): Promise<ProjectFinancials> {
  const supabase = await createClient()
  const [estimates, changeOrders, invoices, tracking] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, family_id, revision, status, estimate_number, decision_at, direct_cost_cents, allowance_cents, contingency_cents, markup_cents, construction_total_cents')
      .eq('project_id', projectId),
    supabase.from('change_orders').select('id, co_number, title, status, decision_at, cost_adjustment_cents, price_adjustment_cents').eq('project_id', projectId),
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
  const pendingIds = cos.filter((c) => PENDING_CHANGE_STATUSES.has(c.status)).map((c) => c.id)

  const [baselineLines, coLines] = await Promise.all([
    baseline.state === 'established'
      ? supabase.from('estimate_line_items').select('id, category, description, line_total_cents').eq('estimate_id', baseline.estimate.id)
      : Promise.resolve({ data: [], error: null }),
    approvedIds.length + pendingIds.length > 0
      ? supabase.from('change_order_line_items').select('id, change_order_id, category, description, cost_cents').in('change_order_id', [...approvedIds, ...pendingIds])
      : Promise.resolve({ data: [], error: null }),
  ])
  if (baselineLines.error || coLines.error) throw new Error('Budget line items could not be loaded.')

  type BaselineLine = { id: string; category: string; description: string; line_total_cents: unknown }
  type ChangeLine = { id: string; change_order_id: string; category: string; description: string; cost_cents: unknown }
  const approvedSet = new Set(approvedIds)
  const baselineRows = ((baselineLines.data ?? []) as BaselineLine[]).map((l) => ({ id: l.id, category: l.category, description: l.description, cost_cents: n(l.line_total_cents) }))
  const changeRows = ((coLines.data ?? []) as ChangeLine[]).map((l) => ({ id: l.id, change_order_id: l.change_order_id, category: l.category, description: l.description, cost_cents: n(l.cost_cents) }))

  const summary = summarizeJobCost({
    baseline:
      baseline.state === 'established'
        ? {
            established: true,
            lines: baselineRows,
            contingencyCents: baseline.estimate.contingency_cents,
            originalCostCents: baseline.originalCostCents,
            contractPriceCents: baseline.contractPriceCents,
          }
        : { established: false },
    approvedChangeOrderLines: changeRows.filter((l) => approvedSet.has(l.change_order_id)),
    approvedPriceAdjustmentsCents: budget.approvedPriceAdjustmentsCents,
    invoices: (invoices.data ?? []).map((i) => ({ status: i.status, total_cents: n(i.total_cents), paid_cents: n(i.paid_cents) })),
    costTracking: tracking?.input ?? null,
  })

  const sources = buildCategorySources({
    projectId,
    baseline:
      baseline.state === 'established'
        ? {
            established: true,
            estimate: { id: baseline.estimate.id, number: baseline.estimate.estimate_number, revision: baseline.estimate.revision, decisionAt: baseline.estimate.decision_at },
            lines: baselineRows,
            contingencyCents: baseline.estimate.contingency_cents,
            originalCostCents: baseline.originalCostCents,
          }
        : { established: false },
    changeOrders: (changeOrders.data ?? []).map((c) => ({ id: c.id, number: c.co_number, title: c.title, status: c.status, decisionAt: c.decision_at })),
    changeOrderLines: changeRows,
    costTracking: tracking?.records ?? null,
  })

  return { baseline, budget, summary, sources }
}
