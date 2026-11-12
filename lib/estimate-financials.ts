import type { EstimateTotals } from './estimates.ts'

export type EstimateFinancials = {
  /** What the builder pays: direct costs plus allowances. Excludes markup, contingency and land. */
  builderCostCents: number
  /** Markup is the builder's profit line. Contingency is a reserve and is reported separately. */
  profitCents: number
  contingencyCents: number
  /** Price to the client before land. The estimate model has no sales tax. */
  clientPriceCents: number
  /** Profit ÷ builder cost, in tenths of a percent. Null when there is no builder cost. */
  markupTenths: number | null
  /** Profit ÷ client price, in tenths of a percent. Null when there is no client price. */
  marginTenths: number | null
}

function ratioTenths(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null
  return Math.round((numerator * 1000) / denominator)
}

/** Derived, display-only figures. Every amount comes from the authoritative totals; nothing is recalculated. */
export function estimateFinancials(totals: EstimateTotals): EstimateFinancials {
  const builderCostCents = totals.direct_cost_cents + totals.allowance_cents
  const profitCents = totals.markup_cents
  const clientPriceCents = totals.construction_total_cents
  return {
    builderCostCents,
    profitCents,
    contingencyCents: totals.contingency_cents,
    clientPriceCents,
    markupTenths: ratioTenths(profitCents, builderCostCents),
    marginTenths: ratioTenths(profitCents, clientPriceCents),
  }
}

export function formatTenths(tenths: number | null): string {
  if (tenths === null) return '—'
  const sign = tenths < 0 ? '-' : ''
  const abs = Math.abs(tenths)
  return `${sign}${Math.trunc(abs / 10)}.${abs % 10}%`
}
