import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankRow, computeTotals, itemTotalBreakdown, rowMath, type SheetRow } from './estimate-sheet.ts'

const row = (patch: Partial<SheetRow>): SheetRow => ({ ...blankRow('Framing'), description: 'Item', ...patch })
const settings = { markup_percent: 0, contingency_percent: 0, land_cost_cents: null }

test('10 units at $250 is a simple $2,500 item total', () => {
  const b = itemTotalBreakdown(row({ quantity: '10', material: '250' }))
  assert.equal(b.valid, true)
  assert.equal(b.simple, true)
  assert.equal(b.quantity, 10)
  assert.equal(b.unitCostCents, 25000)
  assert.equal(b.totalCents, 250000)
})

test('detailed pricing reuses rowMath component rounding', () => {
  const r = row({ quantity: '1.5', material: '10.01', labor: '20.03', other: '0.01' })
  const b = itemTotalBreakdown(r)
  const m = rowMath(r)
  assert.equal(b.simple, false)
  assert.deepEqual(
    b.parts.map((p) => p.totalCents),
    [m.materialCents, m.laborCents, m.otherCents],
  )
  assert.equal(b.totalCents, m.totalCents)
  assert.equal(b.parts.reduce((s, p) => s + p.totalCents, 0), b.totalCents)
})

test('invalid quantity is flagged and not parsed', () => {
  const b = itemTotalBreakdown(row({ quantity: 'abc', material: '5' }))
  assert.equal(b.valid, false)
  assert.equal(b.quantity, null)
})

test('item totals and estimate total agree for a single line', () => {
  const r = row({ quantity: '10', material: '250' })
  assert.equal(computeTotals([r], settings).construction_total_cents, itemTotalBreakdown(r).totalCents)
})
