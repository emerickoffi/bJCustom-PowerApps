import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lineCostCents,
  parseQuantityMilli,
  parseSignedDollarsToCents,
  resolveBaseline,
  summarizeBudget,
  type BaselineCandidate,
} from './financials.ts'

const est = (over: Partial<BaselineCandidate> = {}): BaselineCandidate => ({
  id: 'e1',
  family_id: 'f1',
  revision: 1,
  status: 'approved',
  estimate_number: 'EST-0001',
  decision_at: '2026-10-01T00:00:00Z',
  direct_cost_cents: 100_000_00,
  allowance_cents: 10_000_00,
  contingency_cents: 5_000_00,
  markup_cents: 15_000_00,
  construction_total_cents: 130_000_00,
  ...over,
})

test('baseline excludes markup from cost and uses construction total as contract price', () => {
  const b = resolveBaseline([est()])
  assert.equal(b.state, 'established')
  if (b.state !== 'established') return
  assert.equal(b.originalCostCents, 115_000_00)
  assert.equal(b.contractPriceCents, 130_000_00)
})

test('draft, submitted, and rejected estimates never become the baseline', () => {
  for (const status of ['draft', 'internal_review', 'submitted', 'rejected']) {
    assert.deepEqual(resolveBaseline([est({ status })]), { state: 'not_established', reason: 'no_approved_estimate' })
  }
})

test('two approved estimate families leave the baseline not established', () => {
  const b = resolveBaseline([est(), est({ id: 'e2', family_id: 'f2' })])
  assert.deepEqual(b, { state: 'not_established', reason: 'multiple_approved_estimates' })
})

test('latest approved revision within one family wins', () => {
  const b = resolveBaseline([est(), est({ id: 'e2', revision: 2, direct_cost_cents: 90_000_00 })])
  assert.ok(b.state === 'established' && b.estimate.id === 'e2')
})

test('only approved change orders adjust the revised budget, positive and negative', () => {
  const s = summarizeBudget(resolveBaseline([est()]), [
    { status: 'approved', cost_adjustment_cents: 2_000_00, price_adjustment_cents: 3_000_00 },
    { status: 'approved', cost_adjustment_cents: -500_00, price_adjustment_cents: -700_00 },
    { status: 'draft', cost_adjustment_cents: 9_999_00, price_adjustment_cents: 9_999_00 },
    { status: 'rejected', cost_adjustment_cents: 8_888_00, price_adjustment_cents: 8_888_00 },
    { status: 'void', cost_adjustment_cents: 7_777_00, price_adjustment_cents: 7_777_00 },
  ])
  assert.equal(s.approvedCostAdjustmentsCents, 1_500_00)
  assert.equal(s.approvedPriceAdjustmentsCents, 2_300_00)
  assert.equal(s.revisedCostCents, 116_500_00)
  assert.equal(s.revisedContractCents, 132_300_00)
  assert.equal(s.pendingCount, 1)
})

test('customer price changes do not move the cost budget', () => {
  const s = summarizeBudget(resolveBaseline([est()]), [
    { status: 'approved', cost_adjustment_cents: 0, price_adjustment_cents: 4_000_00 },
  ])
  assert.equal(s.revisedCostCents, 115_000_00)
  assert.equal(s.revisedContractCents, 134_000_00)
})

test('no baseline yields null revised figures, never zero', () => {
  const s = summarizeBudget(resolveBaseline([]), [{ status: 'approved', cost_adjustment_cents: 100, price_adjustment_cents: 100 }])
  assert.equal(s.revisedCostCents, null)
  assert.equal(s.revisedContractCents, null)
  assert.equal(s.approvedCostAdjustmentsCents, 100)
})

test('signed dollar parsing is exact', () => {
  assert.equal(parseSignedDollarsToCents('1,250.5'), 125050)
  assert.equal(parseSignedDollarsToCents('-$300'), -30000)
  assert.equal(parseSignedDollarsToCents('-0'), 0)
  assert.equal(parseSignedDollarsToCents('0.1'), 10)
  assert.equal(parseSignedDollarsToCents('12.345'), null)
  assert.equal(parseSignedDollarsToCents('abc'), null)
})

test('line cost matches Postgres round(quantity * unit_cost)', () => {
  assert.equal(lineCostCents(parseQuantityMilli('1.5')!, 333), 500) // 499.5 -> 500
  assert.equal(lineCostCents(parseQuantityMilli('1.5')!, -333), -500) // half away from zero
  assert.equal(lineCostCents(parseQuantityMilli('0.001')!, 1), 0)
  assert.equal(lineCostCents(parseQuantityMilli('3')!, 1999), 5997)
  assert.equal(parseQuantityMilli('1.2345'), null)
})
