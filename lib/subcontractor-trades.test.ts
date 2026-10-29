import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OTHER_TRADE, STANDARD_TRADES, TRADE_GROUPS, canonicalizeTrade, matchStandardTrade } from './subcontractor-trades.ts'

test('Other is the final option and is not a standard trade', () => {
  const last = TRADE_GROUPS.at(-1)
  assert.deepEqual(last?.items, [OTHER_TRADE])
  assert.equal(STANDARD_TRADES.includes(OTHER_TRADE), false)
  assert.equal(new Set(STANDARD_TRADES).size, STANDARD_TRADES.length)
})

test('casing and simple naming variants fold into the standard trade', () => {
  assert.equal(canonicalizeTrade('  electrical '), 'Electrical')
  assert.equal(canonicalizeTrade('hvac'), 'HVAC')
  assert.equal(canonicalizeTrade('Tile and Stone'), 'Tile & Stone')
  assert.equal(canonicalizeTrade('framing &  carpentry'), 'Framing & Carpentry')
  assert.equal(canonicalizeTrade('Low Voltage and Smart Home'), 'Low-Voltage & Smart Home')
  assert.equal(canonicalizeTrade('Plumber'), 'Plumbing')
})

test('genuinely custom specialties are kept, trimmed and collapsed', () => {
  assert.equal(canonicalizeTrade('  Solar   Installation '), 'Solar Installation')
  assert.equal(matchStandardTrade('Elevator & Lift'), null)
})
