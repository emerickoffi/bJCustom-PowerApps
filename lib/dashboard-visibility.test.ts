import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultVisibility,
  isDefaultVisibility,
  isItemVisible,
  kpiGridClass,
  parseVisibility,
} from './dashboard-visibility.ts'

test('null or malformed stored settings resolve to the built-in defaults', () => {
  assert.ok(isDefaultVisibility(parseVisibility(null)))
  assert.ok(isDefaultVisibility(parseVisibility([])))
  assert.ok(isDefaultVisibility(parseVisibility({ card_approval: 'nope', unknown: { enabled: false } })))
})

test('attention condition falls back to always for items without a reliable rule', () => {
  const v = parseVisibility({ coming_up: { enabled: true, showWhen: 'attention' } })
  assert.equal(v.coming_up.showWhen, 'always')
  const w = parseVisibility({ warranty: { enabled: false, showWhen: 'attention' } })
  assert.deepEqual(w.warranty, { enabled: false, showWhen: 'attention' })
})

test('disabled items are hidden; conditions never hide on unknown data', () => {
  assert.equal(isItemVisible({ enabled: false, showWhen: 'always' }, { records: true, attention: true }), false)
  assert.equal(isItemVisible({ enabled: true, showWhen: 'records' }, { records: false, attention: null }), false)
  assert.equal(isItemVisible({ enabled: true, showWhen: 'records' }, { records: null, attention: null }), true)
  assert.equal(isItemVisible({ enabled: true, showWhen: 'attention' }, { records: true, attention: false }), false)
  assert.equal(isItemVisible({ enabled: true, showWhen: 'attention' }, { records: true, attention: null }), true)
  assert.equal(isItemVisible({ enabled: true, showWhen: 'always' }, { records: false, attention: false }), true)
})

test('defaults show everything always and the KPI grid adapts to card count', () => {
  assert.ok(Object.values(defaultVisibility()).every((i) => i.enabled && i.showWhen === 'always'))
  assert.match(kpiGridClass(4), /xl:grid-cols-4/)
  assert.match(kpiGridClass(3), /sm:grid-cols-3/)
  assert.equal(kpiGridClass(1), 'grid gap-4')
})
