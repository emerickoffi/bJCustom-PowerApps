import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProjectColumns, serializeProjectColumns } from './project-columns.ts'

test('without a saved choice the optional columns are off', () => {
  assert.deepEqual(parseProjectColumns(undefined), [])
  assert.deepEqual(parseProjectColumns(null), [])
  assert.deepEqual(parseProjectColumns(''), [])
})

test('a saved choice is restored, ignoring anything unknown', () => {
  assert.deepEqual(parseProjectColumns('manager'), ['manager'])
  assert.deepEqual(parseProjectColumns('manager.progress'), ['progress', 'manager'])
  assert.deepEqual(parseProjectColumns('none'), [])
  assert.deepEqual(parseProjectColumns('budget.manager;drop'), [])
  assert.deepEqual(parseProjectColumns('budget.progress'), ['progress'])
})

test('a choice survives being saved and read back', () => {
  for (const shown of [[], ['progress'], ['manager'], ['manager', 'progress']] as const) {
    assert.deepEqual([...parseProjectColumns(serializeProjectColumns(shown))].sort(), [...shown].sort())
  }
  assert.equal(serializeProjectColumns([]), 'none')
})
