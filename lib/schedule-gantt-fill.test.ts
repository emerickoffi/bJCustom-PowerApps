import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fillRange, offChartReason } from './schedule-gantt.ts'

test('fillRange extends the end to cover the viewport', () => {
  assert.deepEqual(fillRange({ start: 100, end: 109 }, 1400, 14), { start: 100, end: 199 })
})

test('fillRange leaves ranges wider than the viewport alone', () => {
  const r = { start: 0, end: 499 }
  assert.equal(fillRange(r, 1400, 14), r)
})

test('fillRange ignores an unmeasured viewport', () => {
  const r = { start: 0, end: 9 }
  assert.equal(fillRange(r, 0, 14), r)
})

test('offChartReason prefers filters, then missing dates, then collapsed', () => {
  const visible = new Set(['b', 'c'])
  const undated = new Set(['a', 'b'])
  assert.equal(offChartReason('a', visible, undated), 'filtered')
  assert.equal(offChartReason('b', visible, undated), 'undated')
  assert.equal(offChartReason('c', visible, undated), 'collapsed')
})
