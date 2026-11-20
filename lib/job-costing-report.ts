/**
 * Company job costing report: one row per job, built from the same JobCostSummary each project's Financials tab shows,
 * so the numbers always match. Pure, so node --test can load it.
 */
import { marginBasisPoints, type JobCostSummary } from './job-costing.ts'

export type ReportScope = 'active' | 'completed' | 'all'

export type JobCostReportRow = {
  projectId: string
  projectNumber: string | null
  name: string
  status: string
  /** No approved estimate yet, so there is no budget to compare against. */
  noBudget: boolean
  /** The project's records could not be loaded. */
  failed: boolean
  contractCents: number | null
  budgetCents: number | null
  costToDateCents: number | null
  forecastCents: number | null
  /** Budget minus forecast: negative means the job is heading over budget. */
  overUnderCents: number | null
  profitCents: number | null
  marginBasisPoints: number | null
  billedCents: number
  collectedCents: number
  flag: 'over' | 'low_margin' | null
}

export type JobCostReportTotals = Pick<
  JobCostReportRow,
  'contractCents' | 'budgetCents' | 'costToDateCents' | 'forecastCents' | 'overUnderCents' | 'profitCents' | 'marginBasisPoints' | 'billedCents' | 'collectedCents'
> & { jobs: number; overBudget: number; noBudget: number }

/** Below this projected margin a job is flagged even when it is on budget. */
export const LOW_MARGIN_BASIS_POINTS = 1000

export function reportRow(
  project: { id: string; project_number: string | null; name: string; status: string },
  summary: JobCostSummary | null,
): JobCostReportRow {
  const base = { projectId: project.id, projectNumber: project.project_number, name: project.name, status: project.status }
  if (!summary) {
    return {
      ...base,
      noBudget: false,
      failed: true,
      contractCents: null,
      budgetCents: null,
      costToDateCents: null,
      forecastCents: null,
      overUnderCents: null,
      profitCents: null,
      marginBasisPoints: null,
      billedCents: 0,
      collectedCents: 0,
      flag: null,
    }
  }
  const over = summary.forecastVarianceCents !== null && summary.forecastVarianceCents < 0
  const lowMargin = summary.grossMarginBasisPoints !== null && summary.grossMarginBasisPoints < LOW_MARGIN_BASIS_POINTS
  return {
    ...base,
    noBudget: !summary.budgetEstablished,
    failed: false,
    contractCents: summary.contractRevenueCents,
    budgetCents: summary.revisedCostCents,
    costToDateCents: summary.actualCents,
    forecastCents: summary.forecastCents,
    overUnderCents: summary.forecastVarianceCents,
    profitCents: summary.grossProfitCents,
    marginBasisPoints: summary.grossMarginBasisPoints,
    billedCents: summary.billedCents,
    collectedCents: summary.collectedCents,
    flag: over ? 'over' : lowMargin ? 'low_margin' : null,
  }
}

const sumOrNull = (rows: JobCostReportRow[], pick: (r: JobCostReportRow) => number | null) => {
  const values = rows.map(pick).filter((v): v is number => v !== null)
  return values.length ? values.reduce((a, b) => a + b, 0) : null
}

/** Totals across jobs that have a budget; jobs without one only count toward billed and collected. */
export function reportTotals(rows: JobCostReportRow[]): JobCostReportTotals {
  const budgeted = rows.filter((r) => !r.failed && !r.noBudget)
  const contractCents = sumOrNull(budgeted, (r) => r.contractCents)
  const profitCents = sumOrNull(budgeted, (r) => r.profitCents)
  return {
    jobs: rows.length,
    overBudget: rows.filter((r) => r.flag === 'over').length,
    noBudget: rows.filter((r) => r.noBudget).length,
    contractCents,
    budgetCents: sumOrNull(budgeted, (r) => r.budgetCents),
    costToDateCents: sumOrNull(budgeted, (r) => r.costToDateCents),
    forecastCents: sumOrNull(budgeted, (r) => r.forecastCents),
    overUnderCents: sumOrNull(budgeted, (r) => r.overUnderCents),
    profitCents,
    marginBasisPoints: contractCents !== null && profitCents !== null ? marginBasisPoints(profitCents, contractCents) : null,
    billedCents: rows.reduce((a, r) => a + r.billedCents, 0),
    collectedCents: rows.reduce((a, r) => a + r.collectedCents, 0),
  }
}

/** Jobs needing attention first (over budget, then low margin), then by name. */
export function sortReportRows(rows: JobCostReportRow[]): JobCostReportRow[] {
  const rank = (r: JobCostReportRow) => (r.flag === 'over' ? 0 : r.flag === 'low_margin' ? 1 : r.failed ? 2 : r.noBudget ? 4 : 3)
  return [...rows].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
}
