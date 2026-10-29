/**
 * Phase 7 job costing. Pure, integer-cent calculations only (no floating-point money math).
 *
 * Source of truth per metric:
 * - Original / revised cost budget: lib/financials.ts baseline (single approved estimate) + approved change-order cost lines.
 * - Contract revenue: approved estimate construction total + approved change-order price adjustments.
 * - Committed: commitments in `approved` status (and the billed portion of `closed` ones).
 * - Actual incurred: vendor bills in `approved` status. Drafts and voided bills never count.
 * - Paid to vendors: non-reversed vendor payments on approved bills. Payments never add cost.
 * - Homeowner billed / collected: existing invoices (issued, partially_paid, paid) and their paid_cents.
 */
import { formatMoney } from './financials.ts'

export const COST_CODE_GROUPS = [
  { code: '1000', label: 'General Requirements', categories: ['Survey and Engineering', 'Permits', 'Management Fees'] },
  { code: '2000', label: 'Site Preparation', categories: ['Site Preparation'] },
  { code: '3000', label: 'Foundation', categories: ['Foundation'] },
  { code: '4000', label: 'Framing', categories: ['Framing'] },
  { code: '5000', label: 'Roofing and Exterior', categories: ['Roofing', 'Exterior Work'] },
  { code: '6000', label: 'Plumbing', categories: ['Plumbing'] },
  { code: '7000', label: 'Electrical', categories: ['Electrical'] },
  { code: '8000', label: 'HVAC', categories: ['HVAC'] },
  { code: '9000', label: 'Insulation and Drywall', categories: ['Insulation', 'Drywall'] },
  { code: '10000', label: 'Interior Finishes', categories: ['Painting', 'Appliances'] },
  { code: '11000', label: 'Cabinets and Millwork', categories: ['Cabinets', 'Countertops'] },
  { code: '12000', label: 'Flooring and Tile', categories: ['Flooring'] },
  { code: '13000', label: 'Exterior Improvements', categories: ['Landscaping'] },
  { code: '14000', label: 'Final Inspections and Closeout', categories: [] as string[] },
  { code: '19000', label: 'Other and Contingency', categories: ['Other'] },
] as const

export const CONTINGENCY_CATEGORY = 'Contingency'
export const UNALLOCATED_CATEGORY = 'Unallocated baseline difference'
const FALLBACK_GROUP = '19000'

export function costCodeForCategory(category: string): string {
  for (const g of COST_CODE_GROUPS) if ((g.categories as readonly string[]).includes(category)) return g.code
  return FALLBACK_GROUP
}

export type CostTrackingInput = {
  commitments: { category: string; status: string; amount_cents: number; billed_cents?: number }[]
  bills: { id: string; category: string; status: string; amount_cents: number }[]
  payments: { bill_id: string; amount_cents: number; reversed: boolean }[]
  forecasts: { category: string; etc_cents: number }[]
}

export type JobCostInput = {
  baseline:
    | { established: true; lines: { category: string; cost_cents: number }[]; contingencyCents: number; originalCostCents: number; contractPriceCents: number }
    | { established: false }
  approvedChangeOrderLines: { category: string; cost_cents: number }[]
  approvedPriceAdjustmentsCents: number
  invoices: { status: string; total_cents: number; paid_cents: number }[]
  costTracking: CostTrackingInput | null
}

export type CategoryRow = {
  code: string
  category: string
  originalCents: number
  revisedCents: number
  committedCents: number | null
  actualCents: number | null
  paidCents: number | null
  remainingCommitmentCents: number | null
  forecastCents: number | null
  varianceCents: number | null
  manualEtc: boolean
}

export type GroupRow = Omit<CategoryRow, 'category' | 'manualEtc'> & { label: string; categories: CategoryRow[] }

export type JobCostSummary = {
  budgetEstablished: boolean
  costTrackingAvailable: boolean
  originalCostCents: number | null
  revisedCostCents: number | null
  committedCents: number | null
  actualCents: number | null
  paidToVendorsCents: number | null
  payableCents: number | null
  etcCents: number | null
  forecastCents: number | null
  forecastVarianceCents: number | null
  contractRevenueCents: number | null
  billedCents: number
  collectedCents: number
  homeownerOutstandingCents: number
  grossProfitCents: number | null
  grossMarginBasisPoints: number | null
  groups: GroupRow[]
  alerts: { id: string; tone: 'warning' | 'info'; message: string }[]
}

const BILLED_STATUSES = new Set(['issued', 'partially_paid', 'paid'])

function add(map: Map<string, number>, key: string, cents: number) {
  map.set(key, (map.get(key) ?? 0) + cents)
}

/** Rounds profit ÷ revenue to whole basis points, half away from zero. Null when revenue is not positive. */
export function marginBasisPoints(profitCents: number, revenueCents: number): number | null {
  if (revenueCents <= 0) return null
  const scaled = BigInt(profitCents) * BigInt(10000)
  const rev = BigInt(revenueCents)
  const negative = scaled < BigInt(0)
  const abs = negative ? -scaled : scaled
  const q = (abs * BigInt(2) + rev) / (rev * BigInt(2))
  return Number(negative ? -q : q)
}

export function formatBasisPoints(bp: number | null) {
  if (bp === null) return '—'
  return `${(bp / 100).toFixed(1)}%`
}

export function summarizeJobCost(input: JobCostInput): JobCostSummary {
  const { baseline, costTracking } = input
  const original = new Map<string, number>()
  const adjustments = new Map<string, number>()

  if (baseline.established) {
    let allocated = 0
    for (const l of baseline.lines) {
      add(original, l.category, l.cost_cents)
      allocated += l.cost_cents
    }
    if (baseline.contingencyCents !== 0) add(original, CONTINGENCY_CATEGORY, baseline.contingencyCents)
    allocated += baseline.contingencyCents
    // Keeps category totals reconciled to the approved baseline even if line totals and header totals ever diverge.
    const diff = baseline.originalCostCents - allocated
    if (diff !== 0) add(original, UNALLOCATED_CATEGORY, diff)
    for (const l of input.approvedChangeOrderLines) add(adjustments, l.category, l.cost_cents)
  }

  const committed = new Map<string, number>()
  const remainingCommitment = new Map<string, number>()
  const actual = new Map<string, number>()
  const paid = new Map<string, number>()
  const etc = new Map<string, number>()

  if (costTracking) {
    for (const c of costTracking.commitments) {
      const billed = Math.min(c.billed_cents ?? 0, c.amount_cents)
      if (c.status === 'approved') {
        add(committed, c.category, c.amount_cents)
        add(remainingCommitment, c.category, c.amount_cents - billed)
      } else if (c.status === 'closed') {
        // A closed commitment keeps only what was billed; the unbilled balance is released.
        add(committed, c.category, billed)
      }
    }
    const approvedBills = new Map<string, string>()
    for (const b of costTracking.bills) {
      if (b.status !== 'approved') continue
      add(actual, b.category, b.amount_cents)
      approvedBills.set(b.id, b.category)
    }
    for (const p of costTracking.payments) {
      if (p.reversed) continue
      const category = approvedBills.get(p.bill_id)
      if (category !== undefined) add(paid, category, p.amount_cents)
    }
    for (const f of costTracking.forecasts) etc.set(f.category, f.etc_cents)
  }

  const categories = new Set<string>([
    ...original.keys(),
    ...adjustments.keys(),
    ...committed.keys(),
    ...actual.keys(),
    ...etc.keys(),
  ])

  const rows: CategoryRow[] = [...categories].map((category) => {
    const originalCents = original.get(category) ?? 0
    const revisedCents = originalCents + (adjustments.get(category) ?? 0)
    if (!costTracking) {
      return {
        code: categoryCode(category),
        category,
        originalCents,
        revisedCents,
        committedCents: null,
        actualCents: null,
        paidCents: null,
        remainingCommitmentCents: null,
        forecastCents: null,
        varianceCents: null,
        manualEtc: false,
      }
    }
    const actualCents = actual.get(category) ?? 0
    const remaining = remainingCommitment.get(category) ?? 0
    const manual = etc.get(category)
    const forecastCents = manual !== undefined ? actualCents + manual : Math.max(revisedCents, actualCents + remaining)
    return {
      code: categoryCode(category),
      category,
      originalCents,
      revisedCents,
      committedCents: committed.get(category) ?? 0,
      actualCents,
      paidCents: paid.get(category) ?? 0,
      remainingCommitmentCents: remaining,
      forecastCents,
      varianceCents: baseline.established ? revisedCents - forecastCents : null,
      manualEtc: manual !== undefined,
    }
  })

  const groups = groupRows(rows)
  const sum = (pick: (r: CategoryRow) => number | null) => rows.reduce<number | null>((t, r) => nullableAdd(t, pick(r)), 0)

  const originalCostCents = baseline.established ? baseline.originalCostCents : null
  const revisedCostCents = baseline.established ? sum((r) => r.revisedCents) : null
  const committedCents = costTracking ? sum((r) => r.committedCents) : null
  const actualCents = costTracking ? sum((r) => r.actualCents) : null
  const paidToVendorsCents = costTracking ? sum((r) => r.paidCents) : null
  // Forecasts need an approved baseline; without one, remaining work cannot be estimated.
  const forecastCents = costTracking && baseline.established ? sum((r) => r.forecastCents) : null
  const etcCents = forecastCents !== null && actualCents !== null ? forecastCents - actualCents : null
  const forecastVarianceCents = forecastCents !== null && revisedCostCents !== null ? revisedCostCents - forecastCents : null
  const contractRevenueCents = baseline.established ? baseline.contractPriceCents + input.approvedPriceAdjustmentsCents : null
  const grossProfitCents = contractRevenueCents !== null && forecastCents !== null ? contractRevenueCents - forecastCents : null

  let billedCents = 0
  let collectedCents = 0
  for (const inv of input.invoices) {
    if (!BILLED_STATUSES.has(inv.status)) continue
    billedCents += inv.total_cents
    collectedCents += inv.paid_cents
  }

  const alerts: JobCostSummary['alerts'] = []
  if (!baseline.established) {
    alerts.push({ id: 'no-baseline', tone: 'info', message: 'No approved cost budget yet. Approve one estimate to establish the baseline and contract revenue.' })
  }
  if (forecastVarianceCents !== null && forecastVarianceCents < 0) {
    alerts.push({ id: 'forecast-over', tone: 'warning', message: `Forecast final cost exceeds the revised budget by ${formatMoney(-forecastVarianceCents)}.` })
  }
  if (baseline.established && costTracking) {
    for (const r of rows) {
      if (r.actualCents !== null && r.actualCents > r.revisedCents) {
        alerts.push({ id: `over-${r.category}`, tone: 'warning', message: `${r.category}: actual cost is ${formatMoney(r.actualCents - r.revisedCents)} over its revised budget.` })
      }
    }
  }
  if (costTracking) {
    const draftBills = costTracking.bills.filter((b) => b.status === 'draft').length
    if (draftBills > 0) alerts.push({ id: 'draft-bills', tone: 'info', message: `${draftBills} vendor bill${draftBills === 1 ? '' : 's'} awaiting approval. Unapproved bills are not counted as cost.` })
  }

  return {
    budgetEstablished: baseline.established,
    costTrackingAvailable: costTracking !== null,
    originalCostCents,
    revisedCostCents,
    committedCents,
    actualCents,
    paidToVendorsCents,
    payableCents: actualCents !== null && paidToVendorsCents !== null ? actualCents - paidToVendorsCents : null,
    etcCents,
    forecastCents,
    forecastVarianceCents,
    contractRevenueCents,
    billedCents,
    collectedCents,
    homeownerOutstandingCents: billedCents - collectedCents,
    grossProfitCents,
    grossMarginBasisPoints: grossProfitCents !== null && contractRevenueCents !== null ? marginBasisPoints(grossProfitCents, contractRevenueCents) : null,
    groups,
    alerts,
  }
}

function categoryCode(category: string) {
  if (category === CONTINGENCY_CATEGORY || category === UNALLOCATED_CATEGORY) return FALLBACK_GROUP
  return costCodeForCategory(category)
}

const nullableAdd = (a: number | null, b: number | null) => (a === null || b === null ? null : a + b)

function groupRows(rows: CategoryRow[]): GroupRow[] {
  const groups: GroupRow[] = []
  for (const g of COST_CODE_GROUPS) {
    const members = rows.filter((r) => r.code === g.code).sort((a, b) => a.category.localeCompare(b.category))
    if (members.length === 0) continue
    const first: Omit<GroupRow, 'label' | 'categories' | 'code'> = {
      originalCents: 0,
      revisedCents: 0,
      committedCents: 0,
      actualCents: 0,
      paidCents: 0,
      remainingCommitmentCents: 0,
      forecastCents: 0,
      varianceCents: 0,
    }
    const totals = members.reduce(
      (t, r) => ({
        originalCents: t.originalCents + r.originalCents,
        revisedCents: t.revisedCents + r.revisedCents,
        committedCents: nullableAdd(t.committedCents, r.committedCents),
        actualCents: nullableAdd(t.actualCents, r.actualCents),
        paidCents: nullableAdd(t.paidCents, r.paidCents),
        remainingCommitmentCents: nullableAdd(t.remainingCommitmentCents, r.remainingCommitmentCents),
        forecastCents: nullableAdd(t.forecastCents, r.forecastCents),
        varianceCents: nullableAdd(t.varianceCents, r.varianceCents),
      }),
      first,
    )
    groups.push({ code: g.code, label: g.label, categories: members, ...totals })
  }
  return groups
}
