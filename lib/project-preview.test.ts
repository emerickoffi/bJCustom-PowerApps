import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PREVIEW_SUMMARY_MAX,
  dailyLogSummary,
  isPastPlannedFinish,
  lateActivities,
  pickNextActivity,
  plannedLabel,
  previewErrorState,
  type PreviewActivityRow,
} from './project-preview.ts'
import { undatedOpenActivityCount } from './schedule.ts'

const activity = (over: Partial<PreviewActivityRow> = {}): PreviewActivityRow => ({
  id: 'a1',
  name: 'Framing',
  status: 'not_started',
  planned_start: null,
  planned_end: null,
  activity_type: 'task',
  assigned_to: null,
  ...over,
})

test('next activity is the earliest dated open activity', () => {
  const picked = pickNextActivity([
    activity({ id: 'done', status: 'completed', planned_start: '2026-01-01' }),
    activity({ id: 'skipped', status: 'skipped', planned_start: '2026-01-02' }),
    activity({ id: 'later', planned_start: '2026-03-10' }),
    activity({ id: 'sooner', planned_end: '2026-02-01' }),
    activity({ id: 'undated' }),
  ])
  assert.equal(picked.state, 'ready')
  assert.equal(picked.state === 'ready' && picked.activity.id, 'sooner')
})

test('next activity reports why nothing is next', () => {
  assert.equal(pickNextActivity([]).state, 'empty')
  assert.equal(pickNextActivity([activity({ status: 'skipped' })]).state, 'empty')
  assert.equal(pickNextActivity([activity({ status: 'completed' })]).state, 'complete')
  assert.equal(pickNextActivity([activity({ status: 'completed' }), activity()]).state, 'undated')
})

test('schedule dates are needed exactly when the next activity is undated', () => {
  const cases: PreviewActivityRow[][] = [
    [],
    [activity({ status: 'skipped' })],
    [activity({ status: 'completed', planned_end: '2026-01-01' })],
    [activity({ status: 'completed', planned_end: '2026-01-01' }), activity(), activity({ status: 'in_progress' })],
    [activity(), activity({ planned_start: '2026-03-01' })],
    [activity(), activity({ status: 'delayed', planned_end: '2026-03-01' })],
    [activity({ status: 'skipped', planned_end: '2026-03-01' }), activity({ status: 'on_hold' })],
  ]
  assert.deepEqual(cases.map(undatedOpenActivityCount), [0, 0, 0, 2, 0, 0, 1])
  for (const rows of cases) {
    assert.equal(pickNextActivity(rows).state === 'undated', undatedOpenActivityCount(rows) > 0)
  }
})

test('late activities are open work that is delayed or past its planned finish, most overdue first', () => {
  const late = lateActivities(
    [
      activity({ id: 'future', planned_end: '2026-06-02' }),
      activity({ id: 'delayed-undated', status: 'delayed' }),
      activity({ id: 'overdue', planned_end: '2026-05-01' }),
      activity({ id: 'older', status: 'in_progress', planned_end: '2026-04-01' }),
      activity({ id: 'done', status: 'completed', planned_end: '2026-01-01' }),
      activity({ id: 'skipped', status: 'skipped', planned_end: '2026-01-01' }),
      activity({ id: 'today', planned_end: '2026-06-01' }),
    ],
    '2026-06-01',
  )
  assert.deepEqual(
    late.map((a) => a.id),
    ['older', 'overdue', 'delayed-undated'],
  )
})

test('past planned finish ignores finished work', () => {
  assert.equal(isPastPlannedFinish(activity({ planned_end: '2026-05-01' }), '2026-06-01'), true)
  assert.equal(isPastPlannedFinish(activity({ planned_end: '2026-06-01' }), '2026-06-01'), false)
  assert.equal(isPastPlannedFinish(activity({ status: 'completed', planned_end: '2026-05-01' }), '2026-06-01'), false)
})

test('planned label covers ranges, single days, and start-only dates', () => {
  assert.match(plannedLabel({ planned_start: '2026-03-02', planned_end: '2026-03-06' }), / – /)
  assert.match(plannedLabel({ planned_start: '2026-03-06', planned_end: '2026-03-06' }), /^Planned /)
  assert.match(plannedLabel({ planned_start: null, planned_end: '2026-03-06' }), /^Planned /)
  assert.match(plannedLabel({ planned_start: '2026-03-02', planned_end: null }), /^Starts /)
})

test('daily log summary uses the first written field on one line', () => {
  const empty = { work_performed: null, progress_notes: null, weather_conditions: null }
  assert.equal(dailyLogSummary(empty), null)
  assert.equal(dailyLogSummary({ ...empty, work_performed: '   ', weather_conditions: 'Clear' }), 'Clear')
  assert.equal(dailyLogSummary({ ...empty, work_performed: 'Poured\n\n  footings', progress_notes: 'On track' }), 'Poured footings')
})

test('daily log summary is capped', () => {
  const summary = dailyLogSummary({ work_performed: 'x'.repeat(PREVIEW_SUMMARY_MAX + 50), progress_notes: null, weather_conditions: null })
  assert.equal(summary?.length, PREVIEW_SUMMARY_MAX)
  assert.equal(summary?.endsWith('…'), true)
})

test('only unexpected failures are retryable', () => {
  assert.equal(previewErrorState(401).retry, false)
  assert.equal(previewErrorState(403).retry, false)
  assert.equal(previewErrorState(404).retry, false)
  assert.equal(previewErrorState(500).retry, true)
  assert.equal(previewErrorState(null).retry, true)
})
