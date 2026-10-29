/**
 * Phase 6 financial semantics. All money is integer cents (USD); no floating-point money math.
 *
 * Agreed definitions:
 * - Original approved COST budget = direct cost + allowances + contingency of the single approved
 *   estimate baseline. Markup is margin and is excluded.
 * - Homeowner contract price = that estimate's construction total (excludes land).
 * - Only change orders in status `approved` adjust either figure. Cost and price adjustments stay separate.
 * - With no approved estimate (or more than one approved estimate family) the baseline is not established.
 */

export type BaselineCandidate = {
  id: string
  family_id: string
  revision: number
  status: string
  estimate_number: string
  decision_at: string | null
  direct_cost_cents: number
  allowance_cents: number
  contingency_cents: number
  markup_cents: number
  construction_total_cents: number
}

export type Baseline =
  | { state: 'established'; estimate: BaselineCandidate; originalCostCents: number; contractPriceCents: number }
  | { state: 'not_established'; reason: 'no_approved_estimate' | 'multiple_approved_estimates' }

export function originalCostBudgetCents(e: Pick<BaselineCandidate, 'direct_cost_cents' | 'allowance_cents' | 'contingency_cents'>) {
  return e.direct_cost_cents + e.allowance_cents + e.contingency_cents
}

export function resolveBaseline(estimates: BaselineCandidate[]): Baseline {
  const approved = estimates.filter((e) => e.status === 'approved')
  if (approved.length === 0) return { state: 'not_established', reason: 'no_approved_estimate' }
  const families = new Set(approved.map((e) => e.family_id))
  if (families.size > 1) return { state: 'not_established', reason: 'multiple_approved_estimates' }
  const estimate = [...approved].sort((a, b) => b.revision - a.revision)[0]
  return {
    state: 'established',
    estimate,
    originalCostCents: originalCostBudgetCents(estimate),
    contractPriceCents: estimate.construction_total_cents,
  }
}

export const BASELINE_REASON_LABELS: Record<Extract<Baseline, { state: 'not_established' }>['reason'], string> = {
  no_approved_estimate: 'No estimate on this project has a recorded homeowner approval yet.',
  multiple_approved_estimates:
    'More than one estimate on this project is approved, so the app cannot tell which one is the baseline.',
}

export type ChangeOrderAmounts = {
  status: string
  cost_adjustment_cents: number
  price_adjustment_cents: number
}

export type BudgetSummary = {
  baseline: Baseline
  approvedCostAdjustmentsCents: number
  approvedPriceAdjustmentsCents: number
  revisedCostCents: number | null
  revisedContractCents: number | null
  approvedCount: number
  pendingCount: number
  pendingCostAdjustmentsCents: number
  pendingPriceAdjustmentsCents: number
}

const PENDING = new Set(['draft', 'internal_review', 'awaiting_homeowner'])

export function summarizeBudget(baseline: Baseline, changeOrders: ChangeOrderAmounts[]): BudgetSummary {
  let approvedCost = 0
  let approvedPrice = 0
  let approvedCount = 0
  let pendingCount = 0
  let pendingCost = 0
  let pendingPrice = 0
  for (const co of changeOrders) {
    if (co.status === 'approved') {
      approvedCost += co.cost_adjustment_cents
      approvedPrice += co.price_adjustment_cents
      approvedCount += 1
    } else if (PENDING.has(co.status)) {
      pendingCost += co.cost_adjustment_cents
      pendingPrice += co.price_adjustment_cents
      pendingCount += 1
    }
  }
  const established = baseline.state === 'established'
  return {
    baseline,
    approvedCostAdjustmentsCents: approvedCost,
    approvedPriceAdjustmentsCents: approvedPrice,
    revisedCostCents: established ? baseline.originalCostCents + approvedCost : null,
    revisedContractCents: established ? baseline.contractPriceCents + approvedPrice : null,
    approvedCount,
    pendingCount,
    pendingCostAdjustmentsCents: pendingCost,
    pendingPriceAdjustmentsCents: pendingPrice,
  }
}

/** Parses a signed dollar string ("-1,250.50", "$300") into integer cents. Returns null when invalid. */
export function parseSignedDollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const match = /^(-)?(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  return match[1] && cents !== 0 ? -cents : cents
}

/** Parses a non-negative quantity with up to 3 decimals into thousandths. */
export function parseQuantityMilli(raw: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,3}))?$/.exec(raw.trim())
  if (!match) return null
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'))
}

/** quantity × unit cost, rounded half away from zero exactly like Postgres round(numeric). */
export function lineCostCents(quantityMilli: number, unitCostCents: number): number {
  const product = BigInt(quantityMilli) * BigInt(unitCostCents)
  const negative = product < BigInt(0)
  const abs = negative ? -product : product
  const rounded = (abs + BigInt(500)) / BigInt(1000)
  return Number(negative ? -rounded : rounded)
}

export function centsToSignedInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.trunc(abs / 100)
  const frac = abs % 100
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole}.${String(frac).padStart(2, '0')}`
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'auto' })
const usdSigned = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', signDisplay: 'exceptZero' })

export function formatMoney(cents: number | null | undefined, opts: { signed?: boolean } = {}) {
  if (cents === null || cents === undefined) return '—'
  return (opts.signed ? usdSigned : usd).format(cents / 100)
}
