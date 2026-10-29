import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allowedTransitions, isEditableStatus, parseLines, sumLineCosts, changeOrderPath } from './change-orders.ts'

const row = (over = {}) => ({ category: 'Framing', description: 'Add header', quantity: '2', unit: 'ea', unit_cost: '150.25', ...over })

test('parses lines into exact cents and drops blank rows', () => {
  const { lines, errors } = parseLines([row(), { category: 'Framing', description: '', quantity: '1', unit: '', unit_cost: '' }])
  assert.deepEqual(errors, {})
  assert.equal(lines.length, 1)
  assert.equal(lines[0].cost_cents, 30050)
})

test('credits produce negative cost and sum with additions', () => {
  const { lines } = parseLines([row(), row({ description: 'Remove tile', quantity: '1', unit_cost: '-500' })])
  assert.equal(sumLineCosts(lines), 30050 - 50000)
})

test('reports field errors by row index', () => {
  const { errors } = parseLines([row(), row({ category: 'Nope', quantity: 'x', unit_cost: '1.234' })])
  assert.ok(errors['lines.1.category'])
  assert.ok(errors['lines.1.quantity'])
  assert.ok(errors['lines.1.unit_cost'])
  assert.equal(errors['lines.0.category'], undefined)
})

test('terminal statuses allow no transitions and are not editable', () => {
  for (const s of ['approved', 'rejected', 'void'] as const) {
    assert.deepEqual(allowedTransitions(s), [])
    assert.equal(isEditableStatus(s), false)
  }
  assert.equal(isEditableStatus('awaiting_homeowner'), false)
  assert.ok(allowedTransitions('awaiting_homeowner').includes('approved'))
  assert.ok(!allowedTransitions('draft').includes('approved'))
})

test('detail path encodes both ids', () => {
  assert.equal(changeOrderPath('a/b', 'c d'), '/projects/a%2Fb/change-orders/c%20d')
})
