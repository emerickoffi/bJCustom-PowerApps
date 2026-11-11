import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  billBalance,
  commitmentBilledCents,
  parsePositiveDollarsToCents,
  summarizeBills,
  validateBill,
  validateCommitment,
  validatePayment,
} from './vendor-bills.ts'
import { summarizeJobCost } from './job-costing.ts'

const TODAY = '2026-11-11'
const billValues = {
  vendor_name: 'Acme Framing',
  bill_number: 'INV-100',
  bill_date: '2026-11-01',
  due_date: '2026-11-30',
  amount: '1,250.50',
  cost_category: 'Framing',
  description: 'Second floor framing labor',
}

test('parses positive dollar amounts into integer cents', () => {
  assert.equal(parsePositiveDollarsToCents('1,250.50'), 125050)
  assert.equal(parsePositiveDollarsToCents('$80'), 8000)
  assert.equal(parsePositiveDollarsToCents('0.1'), 10)
  assert.equal(parsePositiveDollarsToCents('0'), null)
  assert.equal(parsePositiveDollarsToCents('-5'), null)
  assert.equal(parsePositiveDollarsToCents('1.234'), null)
  assert.equal(parsePositiveDollarsToCents('abc'), null)
  assert.equal(parsePositiveDollarsToCents('2000000000'), null)
})

test('creates a valid bill input', () => {
  const r = validateBill(billValues)
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.data.amountCents, 125050)
    assert.equal(r.data.commitmentId, null)
  }
})

test('rejects invalid bills with field errors', () => {
  const r = validateBill({ ...billValues, vendor_name: ' ', amount: '0', cost_category: 'Nope', bill_date: '2026-02-30' })
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.errors.vendor_name)
    assert.ok(r.errors.amount)
    assert.ok(r.errors.cost_category)
    assert.ok(r.errors.bill_date)
  }
  const due = validateBill({ ...billValues, due_date: '2026-10-01' })
  assert.equal(due.ok, false)
})

test('linked commitment must exist and match category', () => {
  const commitments = [{ id: 'c1', category: 'Framing' }]
  assert.equal(validateBill({ ...billValues, commitment_id: 'c1' }, commitments).ok, true)
  const missing = validateBill({ ...billValues, commitment_id: 'c2' }, commitments)
  assert.equal(missing.ok, false)
  const mismatch = validateBill({ ...billValues, commitment_id: 'c1', cost_category: 'Plumbing' }, commitments)
  assert.equal(mismatch.ok, false)
  if (!mismatch.ok) assert.match(mismatch.errors.cost_category, /Framing/)
})

test('validates manual commitments', () => {
  assert.equal(validateCommitment({ vendor_name: 'Lumber Co', description: 'Framing package', amount: '9000', cost_category: 'Framing' }).ok, true)
  assert.equal(validateCommitment({ vendor_name: 'Lumber Co', description: '', amount: '9000', cost_category: 'Framing' }).ok, false)
})

test('payment validation blocks overpayment and invalid input', () => {
  const ok = validatePayment({ payment_date: TODAY, amount: '500', method: 'check' }, 125050)
  assert.equal(ok.ok, true)
  const over = validatePayment({ payment_date: TODAY, amount: '1250.51', method: 'check' }, 125050)
  assert.equal(over.ok, false)
  if (!over.ok) assert.match(over.errors.amount, /unpaid balance/)
  const exact = validatePayment({ payment_date: TODAY, amount: '1250.50', method: 'ach' }, 125050)
  assert.equal(exact.ok, true)
  const bad = validatePayment({ payment_date: '', amount: '-1', method: 'bitcoin' }, 125050)
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.deepEqual(Object.keys(bad.errors).sort(), ['amount', 'method', 'payment_date'])
})

test('partial, full and reversed payments update balance and status', () => {
  const bill = { status: 'approved', amount_cents: 100000, due_date: '2026-12-01' }
  assert.deepEqual(billBalance(bill, [], TODAY), { paidCents: 0, balanceCents: 100000, status: 'approved' })
  assert.deepEqual(billBalance(bill, [{ amount_cents: 40000, reversed: false }], TODAY), { paidCents: 40000, balanceCents: 60000, status: 'partially_paid' })
  assert.equal(billBalance(bill, [{ amount_cents: 40000, reversed: false }, { amount_cents: 60000, reversed: false }], TODAY).status, 'paid')
  const reversed = billBalance(bill, [{ amount_cents: 100000, reversed: true }], TODAY)
  assert.equal(reversed.balanceCents, 100000)
  assert.equal(reversed.status, 'approved')
})

test('overdue only for approved bills with balance past due', () => {
  assert.equal(billBalance({ status: 'approved', amount_cents: 5000, due_date: '2026-11-10' }, [], TODAY).status, 'overdue')
  assert.equal(billBalance({ status: 'approved', amount_cents: 5000, due_date: '2026-11-10' }, [{ amount_cents: 5000, reversed: false }], TODAY).status, 'paid')
  assert.equal(billBalance({ status: 'draft', amount_cents: 5000, due_date: '2026-11-10' }, [], TODAY).status, 'draft')
  assert.equal(billBalance({ status: 'voided', amount_cents: 5000, due_date: '2026-11-10' }, [], TODAY).balanceCents, 0)
})

test('bills overview excludes drafts and voided bills from money totals', () => {
  const o = summarizeBills([
    { paidCents: 0, balanceCents: 5000, status: 'draft' },
    { paidCents: 0, balanceCents: 0, status: 'voided' },
    { paidCents: 1000, balanceCents: 4000, status: 'overdue' },
    { paidCents: 2000, balanceCents: 0, status: 'paid' },
  ])
  assert.deepEqual(o, { awaitingApprovalCount: 1, unpaidCents: 4000, overdueCents: 4000, overdueCount: 1, paidCents: 3000 })
})

test('commitment billed counts approved bills only', () => {
  const bills = [
    { commitment_id: 'c1', status: 'approved', amount_cents: 3000 },
    { commitment_id: 'c1', status: 'draft', amount_cents: 9999 },
    { commitment_id: 'c1', status: 'voided', amount_cents: 9999 },
    { commitment_id: 'c2', status: 'approved', amount_cents: 1000 },
  ]
  assert.equal(commitmentBilledCents('c1', bills), 3000)
})

test('commitment, bill and payment are not double counted in job cost', () => {
  const summary = summarizeJobCost({
    baseline: { established: true, lines: [{ category: 'Framing', cost_cents: 100000 }], contingencyCents: 0, originalCostCents: 100000, contractPriceCents: 150000 },
    approvedChangeOrderLines: [],
    approvedPriceAdjustmentsCents: 0,
    invoices: [],
    costTracking: {
      commitments: [{ category: 'Framing', status: 'approved', amount_cents: 80000, billed_cents: 30000 }],
      bills: [
        { id: 'b1', category: 'Framing', status: 'approved', amount_cents: 30000 },
        { id: 'b2', category: 'Framing', status: 'draft', amount_cents: 50000 },
      ],
      payments: [
        { bill_id: 'b1', amount_cents: 10000, reversed: false },
        { bill_id: 'b1', amount_cents: 5000, reversed: true },
      ],
      forecasts: [],
    },
  })
  assert.equal(summary.committedCents, 80000)
  assert.equal(summary.actualCents, 30000)
  assert.equal(summary.paidToVendorsCents, 10000)
  assert.equal(summary.payableCents, 20000)
  // Forecast = max(revised 100000, actual 30000 + remaining commitment 50000): the bill is not added on top of the commitment.
  assert.equal(summary.forecastCents, 100000)
})
