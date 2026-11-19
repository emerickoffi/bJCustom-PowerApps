import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { billingLimits, type BillingEstimate } from './invoice-billing.ts'

const est = (over: Partial<BillingEstimate> = {}): BillingEstimate => ({
  id: 'e1',
  project_id: 'p1',
  family_id: 'f1',
  revision: 1,
  construction_total_cents: 100_000_00,
  ...over,
})

describe('invoice billing limit', () => {
  it('adds approved change orders, positive and negative, to the estimate', () => {
    const limits = billingLimits(
      [est()],
      [{ id: 'i1', estimate_id: 'e1', subtotal_cents: 60_000_00 }],
      [
        { project_id: 'p1', status: 'approved', price_adjustment_cents: 13_950_00 },
        { project_id: 'p1', status: 'approved', price_adjustment_cents: -2_000_00 },
        { project_id: 'p1', status: 'awaiting_homeowner', price_adjustment_cents: 50_000_00 },
        { project_id: 'p2', status: 'approved', price_adjustment_cents: 9_999_00 },
      ],
    )
    const l = limits.get('e1')!
    assert.equal(l.changeOrderCents, 11_950_00)
    assert.equal(l.limitCents, 111_950_00)
    assert.equal(l.remainingCents, 51_950_00)
  })

  it('counts billing across revisions of the same estimate and uses the latest total', () => {
    const limits = billingLimits(
      [est({ id: 'e1', revision: 1, construction_total_cents: 90_000_00 }), est({ id: 'e2', revision: 2, construction_total_cents: 100_000_00 })],
      [
        { id: 'i1', estimate_id: 'e1', subtotal_cents: 40_000_00 },
        { id: 'i2', estimate_id: 'e2', subtotal_cents: 30_000_00 },
      ],
      [],
    )
    assert.equal(limits.get('e1')!.billedCents, 70_000_00)
    assert.equal(limits.get('e2')!.limitCents, 100_000_00)
    assert.equal(limits.get('e2')!.remainingCents, 30_000_00)
  })

  it('keeps the old per-estimate limit when a project has two approved estimates', () => {
    const limits = billingLimits(
      [est({ id: 'a', family_id: 'fa' }), est({ id: 'b', family_id: 'fb', construction_total_cents: 20_000_00 })],
      [{ id: 'i1', estimate_id: 'b', subtotal_cents: 5_000_00 }],
      [{ project_id: 'p1', status: 'approved', price_adjustment_cents: 10_000_00 }],
    )
    assert.equal(limits.get('b')!.changeOrderCents, 0)
    assert.equal(limits.get('b')!.remainingCents, 15_000_00)
    assert.equal(limits.get('a')!.billedCents, 0)
  })

  it('ignores the invoice being edited and never shows a negative remaining amount', () => {
    const limits = billingLimits(
      [est({ construction_total_cents: 10_00 })],
      [
        { id: 'self', estimate_id: 'e1', subtotal_cents: 5_00 },
        { id: 'other', estimate_id: 'e1', subtotal_cents: 50_00 },
      ],
      [],
      'self',
    )
    assert.equal(limits.get('e1')!.billedCents, 50_00)
    assert.equal(limits.get('e1')!.remainingCents, 0)
  })
})
