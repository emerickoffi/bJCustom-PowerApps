import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateFinancials, formatTenths } from './estimate-financials.ts'
import { blankRow, computeTotals, type SheetRow } from './estimate-sheet.ts'

const row = (patch: Partial<SheetRow>): SheetRow => ({ ...blankRow('Framing'), description: 'Item', ...patch })

test('markup and margin use different denominators', () => {
  const totals = computeTotals([row({ quantity: '1', material: '1000' })], {
    markup_percent: 20,
    contingency_percent: 0,
    land_cost_cents: null,
  })
  const f = estimateFinancials(totals)
  assert.equal(f.builderCostCents, 100000)
  assert.equal(f.profitCents, 20000)
  assert.equal(f.clientPriceCents, 120000)
  assert.equal(formatTenths(f.markupTenths), '20.0%')
  assert.equal(formatTenths(f.marginTenths), '16.7%')
})

test('allowances count as builder cost but carry no markup', () => {
  const totals = computeTotals(
    [row({ quantity: '1', material: '1000' }), row({ quantity: '1', material: '1000', is_allowance: true })],
    { markup_percent: 10, contingency_percent: 0, land_cost_cents: null },
  )
  const f = estimateFinancials(totals)
  assert.equal(f.builderCostCents, 200000)
  assert.equal(f.profitCents, 10000)
  assert.equal(formatTenths(f.markupTenths), '5.0%')
})

test('contingency is part of client price but not profit', () => {
  const totals = computeTotals([row({ quantity: '1', material: '1000' })], {
    markup_percent: 0,
    contingency_percent: 5,
    land_cost_cents: null,
  })
  const f = estimateFinancials(totals)
  assert.equal(f.profitCents, 0)
  assert.equal(f.contingencyCents, 5000)
  assert.equal(f.clientPriceCents, 105000)
})

test('empty estimate shows no percentages instead of dividing by zero', () => {
  const f = estimateFinancials(computeTotals([], { markup_percent: 15, contingency_percent: 5, land_cost_cents: null }))
  assert.equal(f.markupTenths, null)
  assert.equal(f.marginTenths, null)
  assert.equal(formatTenths(null), '—')
})
