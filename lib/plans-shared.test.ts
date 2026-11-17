import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlanToOverrides, planAllows, seatUsage, upgradeMessage } from './plans-shared.ts'

const REGISTRY = ['schedule', 'invoices', 'ai_assistant', 'portal', 'client_updates'] as const
const starter = { all_features: false, features: ['schedule', 'portal'] }

describe('plan access', () => {
  it('allows only plan modules, never limits non-registry keys, and treats no plan as unrestricted', () => {
    assert.equal(planAllows(starter, 'schedule', REGISTRY), true)
    assert.equal(planAllows(starter, 'invoices', REGISTRY), false)
    assert.equal(planAllows(starter, 'selections', REGISTRY), true)
    assert.equal(planAllows(null, 'invoices', REGISTRY), true)
    assert.equal(planAllows({ all_features: true, features: [] }, 'invoices', REGISTRY), true)
  })

  it('forces modules outside the plan off but keeps the company choices inside it', () => {
    const out = applyPlanToOverrides({ invoices: true, schedule: false }, starter, REGISTRY)
    assert.equal(out.invoices, false)
    assert.equal(out.ai_assistant, false)
    assert.equal(out.client_updates, false)
    assert.equal(out.schedule, false)
    assert.equal(out.portal, undefined)
  })

  it('leaves overrides untouched for an all-features plan', () => {
    const overrides = { invoices: true }
    assert.equal(applyPlanToOverrides(overrides, { all_features: true, features: [] }, REGISTRY), overrides)
  })
})

describe('seat usage', () => {
  it('counts pending invitations toward a full team', () => {
    const s = seatUsage({ staff_seats: 4, pending_staff_invites: 1, max_staff: 5 })
    assert.equal(s.full, true)
    assert.equal(s.label, '4 of 5 team seats used, 1 invitation pending')
  })
  it('is never full on an unlimited plan', () => {
    const s = seatUsage({ staff_seats: 30, pending_staff_invites: 0, max_staff: null })
    assert.equal(s.full, false)
    assert.equal(s.label, '30 team members (unlimited)')
  })
  it('names the plan to upgrade to', () => {
    assert.equal(upgradeMessage({ upgrade_plans: { invoices: 'Pro' } }, 'invoices'), 'Included in the Pro plan. Contact Trefort to upgrade.')
    assert.equal(upgradeMessage({ upgrade_plans: {} }, 'x'), 'Not included in your plan.')
  })
})
