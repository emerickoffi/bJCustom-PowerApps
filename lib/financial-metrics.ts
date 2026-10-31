import { resolveBaseline, summarizeBudget, type BaselineCandidate, type ChangeOrderAmounts } from './financials.ts'

/**
 * Command Center financial metrics. All money is integer cents in USD, the only currency the app records.
 *
 * Definitions (each reuses an existing source of truth; nothing here is a new ledger):
 * - Estimate revisions: only the latest revision of each estimate family counts, so revisions never double count.
 * - Awaiting approval: latest revision is `submitted` AND its homeowner signature request is fully completed against
 *   the exact signing snapshot (the Phase 1 Action Center rule). A signature alone never makes an estimate approved.
 * - Awaiting homeowner: latest revision is `submitted` without a matching completed signature.
 * - Estimate pipeline: latest revisions in draft, internal review or submitted. Potential value, not revenue.
 * - Contract value: per project, the established approved-estimate baseline construction total plus approved
 *   change-order price adjustments (lib/financials). Projects without a single approved estimate family add nothing.
 * - Current cost budget: the same baseline's direct cost + allowances + contingency plus approved change-order cost.
 * - Receivables: issued or partially paid invoices with total − paid > 0. Drafts, voided and paid invoices never count.
 *   `paid_cents` is maintained by the database from non-reversed payments, so partial payments use the true balance.
 * - Overdue receivables: the remaining balance of those invoices whose due date is before today in the org timezone.
 */

export type Metric<T> =
  | { state: 'available'; value: T }
  /** The source could not be read. Never rendered as a zero. */
  | { state: 'unavailable'; reason: string }
  /** The module is off for the organization. */
  | { state: 'disabled'; reason: string }

export const unavailable = (reason: string) => ({ state: 'unavailable', reason }) as const
export const disabled = (reason: string) => ({ state: 'disabled', reason }) as const
export const available = <T>(value: T) => ({ state: 'available', value }) as const

export type EstimateRow = BaselineCandidate & {
  name: string
  project_id: string
}

export function latestRevisions<T extends { family_id: string; revision: number }>(rows: T[]): T[] {
  const latest = new Map<string, T>()
  for (const row of rows) {
    const current = latest.get(row.family_id)
    if (!current || row.revision > current.revision) latest.set(row.family_id, row)
  }
  return [...latest.values()]
}

const PIPELINE_STATUSES = new Set(['draft', 'internal_review', 'submitted'])

export type EstimateReference = { id: string; estimateNumber: string; name: string; projectId: string; amountCents: number }

export type EstimateSummary = {
  awaitingApproval: { amountCents: number; count: number; items: EstimateReference[] }
  awaitingHomeowner: { amountCents: number; count: number }
  pipeline: { amountCents: number; count: number }
}

export function summarizeEstimates(rows: EstimateRow[], signedAwaitingIds: ReadonlySet<string>): EstimateSummary {
  const awaiting: EstimateReference[] = []
  let homeownerAmount = 0
  let homeownerCount = 0
  let pipelineAmount = 0
  let pipelineCount = 0
  for (const e of latestRevisions(rows)) {
    if (!PIPELINE_STATUSES.has(e.status)) continue
    pipelineAmount += e.construction_total_cents
    pipelineCount += 1
    if (e.status !== 'submitted') continue
    if (signedAwaitingIds.has(e.id)) {
      awaiting.push({
        id: e.id,
        estimateNumber: e.estimate_number,
        name: e.name,
        projectId: e.project_id,
        amountCents: e.construction_total_cents,
      })
    } else {
      homeownerAmount += e.construction_total_cents
      homeownerCount += 1
    }
  }
  awaiting.sort((a, b) => b.amountCents - a.amountCents)
  return {
    awaitingApproval: { amountCents: awaiting.reduce((s, e) => s + e.amountCents, 0), count: awaiting.length, items: awaiting },
    awaitingHomeowner: { amountCents: homeownerAmount, count: homeownerCount },
    pipeline: { amountCents: pipelineAmount, count: pipelineCount },
  }
}

export type ProjectFinancialInput = {
  projectId: string
  estimates: BaselineCandidate[]
  changeOrders: ChangeOrderAmounts[]
}

export type ProjectBudget = {
  projectId: string
  state: 'established' | 'no_approved_estimate' | 'multiple_approved_estimates'
  contractCents: number | null
  costBudgetCents: number | null
  pendingPriceCents: number
  pendingChangeOrders: number
}

export type ContractSummary = {
  contractCents: number
  costBudgetCents: number
  establishedCount: number
  /** More than one approved estimate family; the baseline needs a human decision. */
  needsReviewCount: number
  withoutBaselineCount: number
  pendingPriceCents: number
  projects: ProjectBudget[]
}

export function summarizeContracts(inputs: ProjectFinancialInput[]): ContractSummary {
  const projects: ProjectBudget[] = inputs.map((p) => {
    const baseline = resolveBaseline(p.estimates)
    const budget = summarizeBudget(baseline, p.changeOrders)
    return {
      projectId: p.projectId,
      state: baseline.state === 'established' ? 'established' : baseline.reason,
      contractCents: budget.revisedContractCents,
      costBudgetCents: budget.revisedCostCents,
      pendingPriceCents: baseline.state === 'established' ? budget.pendingPriceAdjustmentsCents : 0,
      pendingChangeOrders: baseline.state === 'established' ? budget.pendingCount : 0,
    }
  })
  const established = projects.filter((p) => p.state === 'established')
  return {
    contractCents: established.reduce((s, p) => s + (p.contractCents ?? 0), 0),
    costBudgetCents: established.reduce((s, p) => s + (p.costBudgetCents ?? 0), 0),
    establishedCount: established.length,
    needsReviewCount: projects.filter((p) => p.state === 'multiple_approved_estimates').length,
    withoutBaselineCount: projects.filter((p) => p.state === 'no_approved_estimate').length,
    pendingPriceCents: established.reduce((s, p) => s + p.pendingPriceCents, 0),
    projects,
  }
}

export type InvoiceRow = { id: string; status: string; due_date: string; total_cents: number; paid_cents: number }

export type ReceivablesSummary = {
  outstandingCents: number
  outstandingCount: number
  overdueCents: number
  overdueCount: number
  oldestOverdueDueDate: string | null
}

const OPEN_INVOICE = new Set(['issued', 'partially_paid'])

export function summarizeReceivables(rows: InvoiceRow[], today: string): ReceivablesSummary {
  const summary: ReceivablesSummary = { outstandingCents: 0, outstandingCount: 0, overdueCents: 0, overdueCount: 0, oldestOverdueDueDate: null }
  for (const inv of rows) {
    if (!OPEN_INVOICE.has(inv.status)) continue
    const balance = inv.total_cents - inv.paid_cents
    if (balance <= 0) continue
    summary.outstandingCents += balance
    summary.outstandingCount += 1
    if (inv.due_date < today) {
      summary.overdueCents += balance
      summary.overdueCount += 1
      if (!summary.oldestOverdueDueDate || inv.due_date < summary.oldestOverdueDueDate) summary.oldestOverdueDueDate = inv.due_date
    }
  }
  return summary
}

export type CostTotals = {
  /** Approved vendor bills, the Job Costing definition of actual cost. */
  actualCents: number
  /** Approved commitments. */
  committedCents: number
}

export type BudgetException =
  | { state: 'verified_variance'; overCents: number; reason: string }
  | { state: 'needs_review'; overCents: number; reason: string }
  | { state: 'within_budget'; reason: string }
  | { state: 'insufficient_data'; reason: string }

/**
 * Compares like with like: cost actuals and commitments against the cost budget (never against the contract price,
 * and never against an estimate that is not the approved baseline).
 */
export function classifyBudget(budget: Pick<ProjectBudget, 'state' | 'costBudgetCents'>, costs: CostTotals | null): BudgetException {
  if (budget.state === 'multiple_approved_estimates') {
    return { state: 'insufficient_data', reason: 'More than one approved estimate, so the cost baseline is ambiguous' }
  }
  if (budget.state !== 'established' || budget.costBudgetCents === null) {
    return { state: 'insufficient_data', reason: 'No approved estimate baseline to compare costs against' }
  }
  if (!costs) return { state: 'insufficient_data', reason: 'Cost tracking is not available' }
  if (costs.actualCents > budget.costBudgetCents) {
    return {
      state: 'verified_variance',
      overCents: costs.actualCents - budget.costBudgetCents,
      reason: 'Approved vendor bills exceed the current cost budget (approved estimate + approved change orders)',
    }
  }
  if (costs.committedCents > budget.costBudgetCents) {
    return {
      state: 'needs_review',
      overCents: costs.committedCents - budget.costBudgetCents,
      reason: 'Approved commitments exceed the current cost budget',
    }
  }
  return { state: 'within_budget', reason: 'Actual and committed costs are within the current cost budget' }
}
