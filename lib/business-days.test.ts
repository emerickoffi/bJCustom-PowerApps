import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addBusinessDays, calculateTargetCompletion, parseBusinessDays } from './business-days.ts'

test('11/02/2026 + 55 business days is 01/15/2027', () => {
  assert.equal(addBusinessDays('2026-11-02', 55), '2027-01-15')
})

test('weekday start with 1 business day ends the same day', () => {
  assert.equal(addBusinessDays('2026-11-04', 1), '2026-11-04')
})

test('Friday start with 2 business days ends Monday', () => {
  assert.equal(addBusinessDays('2026-11-06', 2), '2026-11-09')
})

test('weekend start with 1 business day ends Monday', () => {
  assert.equal(addBusinessDays('2026-11-07', 1), '2026-11-09')
  assert.equal(addBusinessDays('2026-11-08', 1), '2026-11-09')
})

test('crosses DST and year boundaries without shifting', () => {
  assert.equal(addBusinessDays('2026-10-30', 2), '2026-11-02')
  assert.equal(addBusinessDays('2027-03-12', 2), '2027-03-15')
  assert.equal(addBusinessDays('2026-12-31', 2), '2027-01-01')
})

test('rejects invalid inputs', () => {
  assert.equal(addBusinessDays('2026-02-30', 3), null)
  assert.equal(addBusinessDays('2026-11-02', 0), null)
  assert.equal(addBusinessDays('2026-11-02', 1.5), null)
  assert.equal(calculateTargetCompletion('', '5'), null)
  assert.equal(calculateTargetCompletion('2026-11-02', ''), null)
})

test('parses durations', () => {
  assert.deepEqual(parseBusinessDays(''), { value: null, error: null })
  assert.deepEqual(parseBusinessDays(' 12 '), { value: 12, error: null })
  assert.ok(parseBusinessDays('0').error)
  assert.ok(parseBusinessDays('-3').error)
  assert.ok(parseBusinessDays('2.5').error)
  assert.ok(parseBusinessDays('abc').error)
})
