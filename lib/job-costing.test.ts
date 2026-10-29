import { test } from 'node:test'
import assert from 'node:assert/strict'
import { costCodeForCategory, formatBasisPoints, marginBasisPoints, summarizeJobCost, type JobCostInput } from './job-costing.ts'
import { resolveBaseline, summarizeBudget, type BaselineCandidate } from './financials.ts'

const baseline = (over: Partial<Extract<JobCostInput['baseline'], { established: true }>> = {}): JobCostInput['baseline'] => ({
  established: true,
  lines: [
    { category: 'Framing', cost_cents: 50_000_00 },
    { category: 'Plumbing', cost_cents: 20_000_00 },
  ],
  contingencyCents: 5_000_00,
  originalCostCents: 75_000_00,
  contractPriceCents: 100_000_00,
  ...over,
})

const tracking = (over: Partial<NonNullable<JobCostInput['costTracking']>> = {}) => ({
  commitments: [],
  bills: [],
  payments: [],
  forecasts: [],
  ...over,
})

const input = (over: Partial<JobCostInput> = {}): JobCostInput => ({
  baseline: baseline(),
  approvedChangeOrderLines: [],
  approvedPriceAdjustmentsCents: 0,
  invoices: [],
  costTracking: tracking(),
  ...over,
})

test('original approved cost budget includes contingency and reconciles to the estimate header', () => {
  const s = summarizeJobCost(input())
  assert.equal(s.originalCostCents, 75_000_00)
  assert.equal(s.revisedCostCents, 75_000_00)
})

test('a header/line mismatch is shown as an unallocated row so totals stay exact', () => {
  const s = summarizeJobCost(input({ baseline: baseline({ originalCostCents: 75_000_01 }) }))
  assert.equal(s.revisedCostCents, 75_000_01)
  assert.ok(s.groups.some((g) => g.categories.some((c) => c.category === 'Unallocated baseline difference' && c.originalCents === 1)))
})

test('approved change-order cost lines revise the budget by category; price stays separate', () => {
  const s = summarizeJobCost(input({ approvedChangeOrderLines: [{ category: 'Framing', cost_cents: 3_000_00 }], approvedPriceAdjustmentsCents: 4_500_00 }))
  assert.equal(s.originalCostCents, 75_000_00)
  assert.equal(s.revisedCostCents, 78_000_00)
  assert.equal(s.contractRevenueCents, 104_500_00)
  const framing = s.groups.find((g) => g.code === '4000')
  assert.equal(framing?.revisedCents, 53_000_00)
})

test('draft estimates do not establish a baseline', () => {
  const est = (status: string, family = 'f1', revision = 1): BaselineCandidate => ({
    id: `${family}-${revision}`, family_id: family, revision, status, estimate_number: 'E-1', decision_at: null,
    direct_cost_cents: 1, allowance_cents: 0, contingency_cents: 0, markup_cents: 0, construction_total_cents: 2,
  })
  assert.equal(resolveBaseline([est('draft'), est('submitted', 'f1', 2)]).state, 'not_established')
  const s = summarizeJobCost(input({ baseline: { established: false } }))
  assert.equal(s.originalCostCents, null)
  assert.equal(s.contractRevenueCents, null)
  assert.equal(s.grossProfitCents, null)
  assert.equal(s.forecastCents, null)
})

test('draft change orders do not affect approved totals', () => {
  const b = summarizeBudget(
    { state: 'established', estimate: {} as BaselineCandidate, originalCostCents: 100, contractPriceCents: 200 },
    [{ status: 'draft', cost_adjustment_cents: 50, price_adjustment_cents: 70 }],
  )
  assert.equal(b.revisedCostCents, 100)
  assert.equal(b.revisedContractCents, 200)
})

test('commitments count only when approved and are not actual cost', () => {
  const s = summarizeJobCost(input({ costTracking: tracking({
    commitments: [
      { category: 'Framing', status: 'approved', amount_cents: 40_000_00 },
      { category: 'Framing', status: 'draft', amount_cents: 99_000_00 },
      { category: 'Plumbing', status: 'cancelled', amount_cents: 10_000_00 },
    ],
  }) }))
  assert.equal(s.committedCents, 40_000_00)
  assert.equal(s.actualCents, 0)
})

test('a partial bill against a commitment reduces the remaining commitment, not the forecast twice', () => {
  const s = summarizeJobCost(input({ costTracking: tracking({
    commitments: [{ category: 'Framing', status: 'approved', amount_cents: 60_000_00, billed_cents: 20_000_00 }],
    bills: [{ id: 'b1', category: 'Framing', status: 'approved', amount_cents: 20_000_00 }],
  }) }))
  const framing = s.groups.find((g) => g.code === '4000')!.categories[0]
  assert.equal(framing.actualCents, 20_000_00)
  assert.equal(framing.remainingCommitmentCents, 40_000_00)
  // max(revised 50k, actual 20k + remaining 40k) = 60k
  assert.equal(framing.forecastCents, 60_000_00)
  assert.equal(framing.varianceCents, -10_000_00)
})

test('vendor payments reduce payables and never add cost; multiple payments and reversals', () => {
  const s = summarizeJobCost(input({ costTracking: tracking({
    bills: [
      { id: 'b1', category: 'Plumbing', status: 'approved', amount_cents: 10_000_00 },
      { id: 'b2', category: 'Plumbing', status: 'draft', amount_cents: 5_000_00 },
    ],
    payments: [
      { bill_id: 'b1', amount_cents: 3_000_00, reversed: false },
      { bill_id: 'b1', amount_cents: 2_500_00, reversed: false },
      { bill_id: 'b1', amount_cents: 1_000_00, reversed: true },
    ],
  }) }))
  assert.equal(s.actualCents, 10_000_00)
  assert.equal(s.paidToVendorsCents, 5_500_00)
  assert.equal(s.payableCents, 4_500_00)
  assert.ok(s.alerts.some((a) => a.id === 'draft-bills'))
})

test('ETC and EAC use a manual estimate to complete when recorded', () => {
  const s = summarizeJobCost(input({ costTracking: tracking({
    bills: [{ id: 'b1', category: 'Plumbing', status: 'approved', amount_cents: 12_000_00 }],
    forecasts: [{ category: 'Plumbing', etc_cents: 4_000_00 }],
  }) }))
  const plumbing = s.groups.find((g) => g.code === '6000')!.categories[0]
  assert.equal(plumbing.forecastCents, 16_000_00)
  assert.ok(plumbing.manualEtc)
  // Framing 50k + Plumbing 16k + Contingency 5k
  assert.equal(s.forecastCents, 71_000_00)
  assert.equal(s.etcCents, 71_000_00 - 12_000_00)
  assert.equal(s.forecastVarianceCents, 4_000_00)
})

test('gross profit uses contract revenue and forecast cost; margin is exact', () => {
  const s = summarizeJobCost(input())
  assert.equal(s.forecastCents, 75_000_00)
  assert.equal(s.grossProfitCents, 25_000_00)
  assert.equal(s.grossMarginBasisPoints, 2500)
  assert.equal(formatBasisPoints(2500), '25.0%')
  assert.equal(marginBasisPoints(1, 3), 3333)
  assert.equal(marginBasisPoints(-2, 3), -6667)
  assert.equal(marginBasisPoints(5, 0), null)
})

test('without cost-tracking records, forecasts and profit are not produced', () => {
  const s = summarizeJobCost(input({ costTracking: null }))
  assert.equal(s.costTrackingAvailable, false)
  assert.equal(s.actualCents, null)
  assert.equal(s.forecastCents, null)
  assert.equal(s.grossProfitCents, null)
  assert.equal(s.revisedCostCents, 75_000_00)
})

test('homeowner billing excludes drafts and voids and is never treated as cost or profit', () => {
  const s = summarizeJobCost(input({ invoices: [
    { status: 'draft', total_cents: 9_999_00, paid_cents: 0 },
    { status: 'voided', total_cents: 5_000_00, paid_cents: 0 },
    { status: 'partially_paid', total_cents: 20_000_00, paid_cents: 8_000_00 },
    { status: 'paid', total_cents: 10_000_00, paid_cents: 10_000_00 },
  ] }))
  assert.equal(s.billedCents, 30_000_00)
  assert.equal(s.collectedCents, 18_000_00)
  assert.equal(s.homeownerOutstandingCents, 12_000_00)
  assert.equal(s.actualCents, 0)
  assert.equal(s.grossProfitCents, 25_000_00)
})

test('cent arithmetic is exact across many small amounts', () => {
  const bills = Array.from({ length: 1000 }, (_, i) => ({ id: `b${i}`, category: 'Framing', status: 'approved', amount_cents: 10 }))
  const s = summarizeJobCost(input({ costTracking: tracking({ bills }) }))
  assert.equal(s.actualCents, 10_000)
})

test('estimate categories map onto the cost-code catalog, unknown labels fall back safely', () => {
  assert.equal(costCodeForCategory('Drywall'), '9000')
  assert.equal(costCodeForCategory('Countertops'), '11000')
  assert.equal(costCodeForCategory('Something legacy'), '19000')
})
