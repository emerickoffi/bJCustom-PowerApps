import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { billingAccess, describePlanPrice, formatPlanPrice, maxYearlySavingPercent, normalizeStripeStatus, parsePriceLookupKey, priceLookupKey, trialDaysLeft } from './billing-shared.ts'

const NOW = Date.parse('2026-11-17T12:00:00Z')
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString()

describe('billing access', () => {
  it('never limits internal or paying companies', () => {
    assert.equal(billingAccess({ subscription_status: 'internal', trial_ends_at: null }, NOW).state, 'ok')
    assert.equal(billingAccess({ subscription_status: 'active', trial_ends_at: inDays(-30) }, NOW).state, 'ok')
  })
  it('warns in the last 3 trial days and blocks after the trial', () => {
    assert.equal(billingAccess({ subscription_status: 'trialing', trial_ends_at: inDays(10) }, NOW).state, 'ok')
    const soon = billingAccess({ subscription_status: 'trialing', trial_ends_at: inDays(2) }, NOW)
    assert.equal(soon.state, 'warning')
    assert.match(soon.reason!, /2 days/)
    assert.equal(billingAccess({ subscription_status: 'trialing', trial_ends_at: inDays(-0.01) }, NOW).state, 'blocked')
  })
  it('keeps access while a payment is retried, blocks once unpaid or canceled', () => {
    assert.equal(billingAccess({ subscription_status: 'past_due', trial_ends_at: null }, NOW).state, 'warning')
    assert.equal(billingAccess({ subscription_status: 'unpaid', trial_ends_at: null }, NOW).state, 'blocked')
    assert.equal(billingAccess({ subscription_status: 'canceled', trial_ends_at: null }, NOW).state, 'blocked')
  })
  it('counts trial days up', () => {
    assert.equal(trialDaysLeft(inDays(13.2), NOW), 14)
    assert.equal(trialDaysLeft(inDays(-1), NOW), 0)
    assert.equal(trialDaysLeft(null, NOW), null)
  })
})

describe('prices', () => {
  it('formats prices', () => {
    assert.equal(formatPlanPrice(14900, 'month'), '$149/mo')
    assert.equal(formatPlanPrice(149000, 'year'), '$1,490/yr')
    assert.equal(formatPlanPrice(null, 'month'), 'Contact us')
  })
  it('round-trips lookup keys and rejects others', () => {
    assert.equal(priceLookupKey('pro', 'year'), 'trefort_pro_year')
    assert.deepEqual(parsePriceLookupKey('trefort_business_month'), { planKey: 'business', interval: 'month' })
    assert.equal(parsePriceLookupKey('other_pro_month'), null)
    assert.equal(parsePriceLookupKey(null), null)
  })
  it('normalizes unknown Stripe statuses to incomplete', () => {
    assert.equal(normalizeStripeStatus('active'), 'active')
    assert.equal(normalizeStripeStatus('weird'), 'incomplete')
  })
})

describe('annual prices', () => {
  const plans = [
    { monthly_price_cents: 9900, yearly_price_cents: 106800 },
    { monthly_price_cents: 19900, yearly_price_cents: 214800 },
    { monthly_price_cents: 39900, yearly_price_cents: 418800 },
  ]
  it('quotes yearly plans per month with the yearly total and saving', () => {
    assert.deepEqual(describePlanPrice(plans[0], 'year'), { headline: '$89/mo', note: 'Billed annually ($1,068/yr), save $120' })
    assert.deepEqual(describePlanPrice(plans[1], 'year'), { headline: '$179/mo', note: 'Billed annually ($2,148/yr), save $240' })
    assert.deepEqual(describePlanPrice(plans[2], 'year'), { headline: '$349/mo', note: 'Billed annually ($4,188/yr), save $600' })
    assert.deepEqual(describePlanPrice(plans[1], 'month'), { headline: '$199/mo', note: 'Billed monthly' })
  })
  it('reports the best yearly saving for the toggle', () => {
    assert.equal(maxYearlySavingPercent(plans), 12)
  })
})
