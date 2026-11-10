import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addDaysIso, classifyActivity } from './schedule-filters.ts'

const today = '2026-11-09'
const horizon = addDaysIso(today, 14)

test('computes the 14-day horizon across month and year boundaries', () => {
  assert.equal(horizon, '2026-11-23')
  assert.equal(addDaysIso('2026-12-25', 14), '2027-01-08')
})

test('undated activities are unscheduled, never overdue', () => {
  assert.deepEqual(classifyActivity({ status: 'not_started', planned_start: null, planned_end: null }, today, horizon), ['all', 'unscheduled'])
})

test('an in-progress activity can also be overdue', () => {
  const f = classifyActivity({ status: 'in_progress', planned_start: '2026-10-01', planned_end: '2026-11-01' }, today, horizon)
  assert.ok(f.includes('in_progress'))
  assert.ok(f.includes('overdue'))
  assert.ok(!f.includes('upcoming'))
})

test('open activities starting or due inside the window are upcoming', () => {
  assert.ok(classifyActivity({ status: 'not_started', planned_start: horizon, planned_end: '2026-12-30' }, today, horizon).includes('upcoming'))
  assert.ok(!classifyActivity({ status: 'not_started', planned_start: '2026-11-24', planned_end: null }, today, horizon).includes('upcoming'))
  assert.deepEqual(classifyActivity({ status: 'completed', planned_start: today, planned_end: today }, today, horizon), ['all'])
})
