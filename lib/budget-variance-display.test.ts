import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeBudgetVariance } from './budget-variance-display.ts'

test('regression: within/on budget is labeled preliminary and never shown as healthy', () => {
  assert.deepEqual(describeBudgetVariance(-5000, false), { note: 'Preliminary: estimate within budget', tone: undefined })
  assert.deepEqual(describeBudgetVariance(0, false), { note: 'Preliminary: estimate on budget', tone: undefined })
})

test('over budget keeps the danger tone, labeled preliminary', () => {
  assert.deepEqual(describeBudgetVariance(1, false), { note: 'Preliminary: estimate over budget', tone: 'danger' })
})

test('missing inputs and load failures are unchanged', () => {
  assert.deepEqual(describeBudgetVariance(null, false), { note: 'Needs a budget and an approved estimate', tone: undefined })
  assert.deepEqual(describeBudgetVariance(null, true), { note: undefined, tone: undefined })
})
