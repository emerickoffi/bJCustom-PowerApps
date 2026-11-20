import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeCoupon } from './billing-discounts-shared.ts'

const base = { name: null, percent_off: null, amount_off: null, duration: 'forever', duration_in_months: null }

test('uses the coupon name when it has one', () => {
  assert.equal(describeCoupon({ ...base, name: 'Founding builder', percent_off: 30 }), 'Founding builder')
})

test('describes percent and amount coupons by duration', () => {
  assert.equal(describeCoupon({ ...base, percent_off: 20, duration: 'repeating', duration_in_months: 3 }), '20% off for 3 months')
  assert.equal(describeCoupon({ ...base, percent_off: 50, duration: 'repeating', duration_in_months: 1 }), '50% off for 1 month')
  assert.equal(describeCoupon({ ...base, amount_off: 5000, duration: 'once' }), '$50 off the first payment')
  assert.equal(describeCoupon({ ...base, amount_off: 1250 }), '$12.50 off forever')
})
