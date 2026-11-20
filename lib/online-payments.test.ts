import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { accountSetupState, decidePayment, estimateProcessingFeeCents } from './online-payments.ts'

const account = { charges_enabled: true, accept_card: true, accept_ach: true }
const invoice = { status: 'issued', total_cents: 1_000_00, paid_cents: 0 }

describe('online payments', () => {
  it('offers both methods for the remaining balance', () => {
    assert.deepEqual(decidePayment({ featureOn: true, account, invoice: { ...invoice, status: 'partially_paid', paid_cents: 400_00 }, sessions: [] }), {
      canPay: true,
      balanceCents: 600_00,
      methods: ['card', 'ach'],
    })
  })

  it('hides payment when off, not ready, paid, voided or a draft', () => {
    assert.equal(decidePayment({ featureOn: false, account, invoice, sessions: [] }).canPay, false)
    assert.equal(decidePayment({ featureOn: true, account: null, invoice, sessions: [] }).canPay, false)
    assert.equal(decidePayment({ featureOn: true, account: { ...account, charges_enabled: false }, invoice, sessions: [] }).canPay, false)
    assert.equal(decidePayment({ featureOn: true, account, invoice: { ...invoice, status: 'paid', paid_cents: 1_000_00 }, sessions: [] }).canPay, false)
    assert.equal(decidePayment({ featureOn: true, account, invoice: { ...invoice, status: 'voided' }, sessions: [] }).canPay, false)
  })

  it('blocks a second payment while a bank transfer is processing', () => {
    const d = decidePayment({ featureOn: true, account, invoice, sessions: [{ status: 'processing', amount_cents: 1_000_00 }] })
    assert.equal(d.canPay, false)
    assert.equal(!d.canPay && d.reason, 'processing')
  })

  it('respects the builder’s accepted methods and the card limit', () => {
    const big = { ...invoice, total_cents: 2_000_000_00 }
    const d = decidePayment({ featureOn: true, account, invoice: big, sessions: [] })
    assert.deepEqual(d.canPay && d.methods, ['ach'])
    const cardOnly = decidePayment({ featureOn: true, account: { ...account, accept_ach: false }, invoice, sessions: [] })
    assert.deepEqual(cardOnly.canPay && cardOnly.methods, ['card'])
  })

  it('estimates Stripe fees', () => {
    assert.equal(estimateProcessingFeeCents('card', 1_000_00), 29_30)
    assert.equal(estimateProcessingFeeCents('ach', 500_00), 4_00)
    assert.equal(estimateProcessingFeeCents('ach', 50_000_00), 5_00)
  })

  it('describes setup progress', () => {
    const base = { stripe_account_id: 'acct_1', livemode: false, details_submitted: false, charges_enabled: false, payouts_enabled: false, accept_card: true, accept_ach: true, requirements_due: [] }
    assert.equal(accountSetupState(null), 'not_started')
    assert.equal(accountSetupState(base), 'incomplete')
    assert.equal(accountSetupState({ ...base, details_submitted: true }), 'pending')
    assert.equal(accountSetupState({ ...base, details_submitted: true, charges_enabled: true }), 'ready')
  })
})
