/**
 * Presentation for the approved-estimate vs. project-budget variance. This comparison is a preliminary
 * budget-based projection, not verified cost evidence, so it is never shown as a positive (healthy) result.
 */
export type BudgetVarianceDisplay = { note: string | undefined; tone: 'danger' | undefined }

export function describeBudgetVariance(varianceCents: number | null, loadFailed: boolean): BudgetVarianceDisplay {
  if (loadFailed) return { note: undefined, tone: undefined }
  if (varianceCents === null) return { note: 'Needs a budget and an approved estimate', tone: undefined }
  if (varianceCents > 0) return { note: 'Preliminary: estimate over budget', tone: 'danger' }
  return {
    note: varianceCents < 0 ? 'Preliminary: estimate within budget' : 'Preliminary: estimate on budget',
    tone: undefined,
  }
}

export const BUDGET_VARIANCE_HELP = 'Preliminary projection from the approved estimate. Not verified against commitments or vendor bills.'
