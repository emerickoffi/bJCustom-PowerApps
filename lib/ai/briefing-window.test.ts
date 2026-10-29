import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDaysIso, briefingWindow, clip } from './briefing-window.ts'

test('daily window covers today and yesterday', () => {
  assert.deepEqual(briefingWindow('daily', '2026-10-28'), { from: '2026-10-27', to: '2026-10-28', label: 'today and yesterday' })
})

test('weekly window covers seven calendar days including today', () => {
  assert.deepEqual(briefingWindow('weekly', '2026-11-02'), { from: '2026-10-27', to: '2026-11-02', label: 'last 7 days' })
})

test('addDaysIso crosses month and year boundaries', () => {
  assert.equal(addDaysIso('2026-03-01', -1), '2026-02-28')
  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01')
})

test('clip trims, drops empty notes, and caps length', () => {
  assert.equal(clip('  poured footings  '), 'poured footings')
  assert.equal(clip('   '), null)
  assert.equal(clip(null), null)
  assert.equal(clip('abcdef', 3), 'abc…')
})
