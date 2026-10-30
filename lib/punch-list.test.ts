import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignItemNumbers, compareItemNumbers, findDuplicateNumber, isValidItemNumber, withItemNumbers } from './punch-list.ts'

test('orders hierarchical numbers naturally, not as text or floats', () => {
  const input = ['10.1', '2', '1.1', '10', '1', '1.2', '1.10']
  assert.deepEqual([...input].sort(compareItemNumbers), ['1', '1.1', '1.2', '1.10', '2', '10', '10.1'])
})

test('validates item number format', () => {
  for (const ok of ['1', '1.1', '10.5', '2.0', '9999.9999']) assert.equal(isValidItemNumber(ok), true, ok)
  for (const bad of ['0', '01', '1.', '.1', '1..2', '1.2.3.4.5', 'a', '-1', '1.5e2', '']) assert.equal(isValidItemNumber(bad), false, bad)
})

test('auto numbers follow the highest manual top-level number', () => {
  assert.deepEqual(assignItemNumbers(['', '3.1', null, '']), ['4', '3.1', '5', '6'])
  assert.deepEqual(assignItemNumbers([null, null]), ['1', '2'])
})

test('detects duplicates', () => {
  assert.equal(findDuplicateNumber(['1', '1.1', '2']), null)
  assert.equal(findDuplicateNumber(['1', '1.1', '1.1']), '1.1')
})

test('legacy items without numbers keep their original order', () => {
  const rows = withItemNumbers([{ label: 'a' }, { label: 'b' }, { label: 'c', item_number: null }])
  assert.deepEqual(rows.map((r) => [r.number, r.label]), [['1', 'a'], ['2', 'b'], ['3', 'c']])
})
