import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeJobCost, type CategoryRow, type JobCostInput } from './job-costing.ts'
import { buildCategorySources, sumCents, type SourceInput } from './job-cost-sources.ts'

const estimate = { id: 'est', number: 'E-100', revision: 2, decisionAt: '2026-10-01' }

function fixture(established: boolean): SourceInput {
  return {
    projectId: 'p1',
    baseline: established
      ? {
          established: true,
          estimate,
          lines: [
            { id: 'l1', category: 'Framing', description: 'Walls', cost_cents: 40_000_00 },
            { id: 'l2', category: 'Framing', description: 'Roof', cost_cents: 10_000_00 },
            { id: 'l3', category: 'Plumbing', description: 'Rough-in', cost_cents: 20_000_00 },
          ],
          contingencyCents: 5_000_00,
          originalCostCents: 75_500_00,
        }
      : { established: false },
    changeOrders: [
      { id: 'co1', number: 'CO-001', title: 'Add beam', status: 'approved', decisionAt: '2026-10-05' },
      { id: 'co2', number: 'CO-002', title: 'Fixture credit', status: 'approved', decisionAt: '2026-10-06' },
      { id: 'co3', number: 'CO-003', title: 'Pending deck', status: 'awaiting_homeowner', decisionAt: null },
      { id: 'co4', number: 'CO-004', title: 'Rejected', status: 'rejected', decisionAt: null },
    ],
    changeOrderLines: [
      { id: 'c1', change_order_id: 'co1', category: 'Framing', description: 'LVL', cost_cents: 2_500_00 },
      { id: 'c2', change_order_id: 'co2', category: 'Plumbing', description: 'Credit', cost_cents: -1_000_00 },
      { id: 'c3', change_order_id: 'co3', category: 'Framing', description: 'Deck', cost_cents: 9_000_00 },
      { id: 'c4', change_order_id: 'co4', category: 'Framing', description: 'No', cost_cents: 7_000_00 },
    ],
    costTracking: {
      commitments: [
        { id: 'k1', category: 'Framing', status: 'approved', amount_cents: 30_000_00, vendor: 'Acme', description: 'Framing sub', type: 'subcontract', date: '2026-10-02' },
        { id: 'k2', category: 'Plumbing', status: 'closed', amount_cents: 15_000_00, vendor: 'Pipes', description: 'Plumbing sub', type: 'subcontract', date: '2026-10-02' },
        { id: 'k3', category: 'Plumbing', status: 'draft', amount_cents: 4_000_00, vendor: 'Other', description: 'Draft PO', type: 'purchase_order', date: '2026-10-02' },
      ],
      bills: [
        { id: 'b1', commitment_id: 'k1', category: 'Framing', status: 'approved', amount_cents: 12_000_00, vendor: 'Acme', number: 'A-1', description: 'Progress 1', date: '2026-10-10' },
        { id: 'b2', commitment_id: 'k2', category: 'Plumbing', status: 'approved', amount_cents: 11_000_00, vendor: 'Pipes', number: 'P-1', description: 'Final', date: '2026-10-11' },
        { id: 'b3', commitment_id: null, category: 'Electrical', status: 'approved', amount_cents: 3_000_00, vendor: 'Sparks', number: null, description: 'Direct cost', date: '2026-10-12' },
        { id: 'b4', commitment_id: 'k1', category: 'Framing', status: 'draft', amount_cents: 8_000_00, vendor: 'Acme', number: 'A-2', description: 'Progress 2', date: '2026-10-13' },
        { id: 'b5', commitment_id: null, category: 'Framing', status: 'voided', amount_cents: 1_000_00, vendor: 'X', number: 'X-1', description: 'Void', date: '2026-10-13' },
      ],
      payments: [
        { id: 'pay1', bill_id: 'b1', amount_cents: 12_000_00, reversed: false, date: '2026-10-15', method: 'ach', reference: null },
        { id: 'pay2', bill_id: 'b2', amount_cents: 5_000_00, reversed: true, date: '2026-10-15', method: 'check', reference: '1001' },
        { id: 'pay3', bill_id: 'b2', amount_cents: 6_000_00, reversed: false, date: '2026-10-16', method: 'check', reference: '1002' },
        { id: 'pay4', bill_id: 'b4', amount_cents: 1_00, reversed: false, date: '2026-10-16', method: 'cash', reference: null },
      ],
    },
  }
}

function toJobCostInput(s: SourceInput): JobCostInput {
  const approved = new Set(s.changeOrders.filter((c) => c.status === 'approved').map((c) => c.id))
  const t = s.costTracking
  return {
    baseline: s.baseline.established
      ? { established: true, lines: s.baseline.lines, contingencyCents: s.baseline.contingencyCents, originalCostCents: s.baseline.originalCostCents, contractPriceCents: 100_000_00 }
      : { established: false },
    approvedChangeOrderLines: s.changeOrderLines.filter((l) => approved.has(l.change_order_id)),
    approvedPriceAdjustmentsCents: 0,
    invoices: [],
    costTracking: t && {
      commitments: t.commitments.map((c) => ({
        category: c.category,
        status: c.status,
        amount_cents: c.amount_cents,
        billed_cents: t.bills.filter((b) => b.status === 'approved' && b.commitment_id === c.id).reduce((x, b) => x + b.amount_cents, 0),
      })),
      bills: t.bills.map((b) => ({ id: b.id, category: b.category, status: b.status, amount_cents: b.amount_cents })),
      payments: t.payments,
      forecasts: [],
    },
  }
}

function assertReconciles(s: SourceInput) {
  const summary = summarizeJobCost(toJobCostInput(s))
  const sources = buildCategorySources(s)
  const rows: CategoryRow[] = summary.groups.flatMap((g) => g.categories)
  assert.ok(rows.length > 0)
  for (const r of rows) {
    const src = sources[r.category]
    assert.ok(src, `sources for ${r.category}`)
    assert.equal(sumCents(src.baseline), r.originalCents, `${r.category} original`)
    assert.equal(sumCents(src.baseline) + sumCents(src.approvedChanges), r.revisedCents, `${r.category} revised`)
    assert.equal(sumCents(src.committed), r.committedCents, `${r.category} committed`)
    assert.equal(sumCents(src.actual), r.actualCents, `${r.category} actual`)
    assert.equal(sumCents(src.paid), r.paidCents, `${r.category} paid`)
  }
  return { summary, sources }
}

test('source contributions reconcile to every table amount with a baseline', () => {
  const { sources } = assertReconciles(fixture(true))
  assert.equal(sumCents(sources['Unallocated baseline difference'].baseline), 500_00)
  assert.equal(sumCents(sources.Contingency.baseline), 5_000_00)
  assert.equal(sumCents(sources.Plumbing.approvedChanges), -1_000_00, 'credit change order reduces budget')
  assert.equal(sumCents(sources.Framing.pendingChanges), 9_000_00, 'pending changes kept separate')
  assert.equal(sources.Framing.approvedChanges.some((r) => r.reference === 'CO-004'), false, 'rejected excluded')
  assert.equal(sumCents(sources.Plumbing.committed), 11_000_00, 'closed commitment keeps billed portion only')
  assert.equal(sources.Plumbing.excluded.committed.length, 1, 'draft commitment not counted')
  assert.equal(sources.Framing.excluded.actual.length, 2, 'draft and voided bills not counted')
  assert.equal(sources.Plumbing.excluded.paid.length, 1, 'reversed payment not counted')
  assert.equal(sources.Framing.paid.some((p) => p.id === 'pay4'), false, 'payment on draft bill not counted')
})

test('without a baseline, costs still reconcile and change orders do not create budget', () => {
  const { summary, sources } = assertReconciles(fixture(false))
  assert.equal(summary.budgetEstablished, false)
  assert.equal(sources.Framing.approvedChanges.length, 0)
  assert.equal(sumCents(sources.Framing.actual), 12_000_00)
})

test('payments never add to actual cost', () => {
  const { sources } = assertReconciles(fixture(true))
  assert.equal(sumCents(sources.Framing.actual), 12_000_00)
  assert.equal(sumCents(sources.Framing.paid), 12_000_00)
})
