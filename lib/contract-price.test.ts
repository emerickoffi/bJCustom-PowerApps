import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeContractPrice } from './contract-price.ts'

const base = {
  estimateCents: 500_000_00,
  changeOrders: [
    { status: 'approved', price_adjustment_cents: 12_000_00 },
    { status: 'approved', price_adjustment_cents: -2_000_00 },
    { status: 'awaiting_homeowner', price_adjustment_cents: 3_500_00 },
    { status: 'rejected', price_adjustment_cents: 9_999_00 },
  ],
  invoices: [
    { status: 'paid', subtotal_cents: 100_000_00, total_cents: 108_250_00, paid_cents: 108_250_00, due_date: '2026-10-01' },
    { status: 'partially_paid', subtotal_cents: 50_000_00, total_cents: 50_000_00, paid_cents: 20_000_00, due_date: '2026-11-01' },
    { status: 'issued', subtotal_cents: 10_000_00, total_cents: 10_000_00, paid_cents: 0, due_date: '2026-12-31' },
    { status: 'draft', subtotal_cents: 99_000_00, total_cents: 99_000_00, paid_cents: 0, due_date: '2026-01-01' },
    { status: 'voided', subtotal_cents: 77_000_00, total_cents: 77_000_00, paid_cents: 0, due_date: '2026-01-01' },
  ],
  selectionsNeedingChangeOrder: 2,
  today: '2026-11-20',
}

test('contract price = estimate + approved change orders; pending and rejected excluded', () => {
  const s = summarizeContractPrice(base)
  assert.equal(s.originalCents, 500_000_00)
  assert.equal(s.approvedChangeCents, 10_000_00)
  assert.equal(s.approvedChangeCount, 2)
  assert.equal(s.pendingChangeCents, 3_500_00)
  assert.equal(s.pendingChangeCount, 1)
  assert.equal(s.contractCents, 510_000_00)
  assert.equal(s.selectionsNeedingChangeOrder, 2)
})

test('billing uses subtotals before tax on active invoices; balance and overdue use totals', () => {
  const s = summarizeContractPrice(base)
  assert.equal(s.billedCents, 160_000_00)
  assert.equal(s.leftToBillCents, 350_000_00)
  assert.equal(s.paidCents, 128_250_00)
  assert.equal(s.balanceDueCents, 40_000_00)
  assert.equal(s.overdueCount, 1)
  assert.equal(s.overdueCents, 30_000_00)
})

test('no approved estimate: no contract price, billing still counted', () => {
  const s = summarizeContractPrice({ ...base, estimateCents: null })
  assert.equal(s.contractCents, null)
  assert.equal(s.leftToBillCents, null)
  assert.equal(s.billedCents, 160_000_00)
})
