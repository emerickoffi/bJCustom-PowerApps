import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dueDateLabel, nextStepDue } from './next-step-due.ts'
import { summarizeStageActivities, type StageActivityRow } from './stage-activities.ts'

const TODAY = '2026-11-04'
const row = (id: string, planned_end: string | null, sort_order: number, status = 'not_started'): StageActivityRow => ({
  id,
  project_id: 'p1',
  name: `Activity ${id}`,
  phase: 'Construction',
  status,
  planned_end,
  sort_order,
})

test('Due is the date of the same activity selected as the next step', () => {
  const data = summarizeStageActivities('under_construction', [row('a', '2026-11-20', 1), row('b', '2026-11-09', 2)], [], TODAY)
  assert.equal(data?.state, 'next')
  const due = nextStepDue({ stageActivities: data })
  assert.deepEqual(due, { kind: 'dated', dueOn: '2026-11-09', overdue: false, activityId: 'b' })
  assert.equal(data?.state === 'next' && data.activity.id, 'b')
})

test('Due keeps the existing overdue flag and does not mark today as overdue', () => {
  const overdue = summarizeStageActivities('under_construction', [row('a', '2026-11-01', 1)], [], TODAY)
  assert.deepEqual(nextStepDue({ stageActivities: overdue }), { kind: 'dated', dueOn: '2026-11-01', overdue: true, activityId: 'a' })
  const today = summarizeStageActivities('under_construction', [row('a', TODAY, 1)], [], TODAY)
  assert.deepEqual(nextStepDue({ stageActivities: today }), { kind: 'dated', dueOn: TODAY, overdue: false, activityId: 'a' })
})

test('A blocked next step still reports its own date', () => {
  const data = summarizeStageActivities(
    'under_construction',
    [row('a', '2026-11-12', 1), row('pre', null, 0, 'completed'), row('b', '2026-11-15', 2)],
    [
      { predecessor_id: 'a', successor_id: 'b' },
      { predecessor_id: 'b', successor_id: 'a' },
    ],
    TODAY,
  )
  assert.equal(data?.state, 'blocked')
  assert.deepEqual(nextStepDue({ stageActivities: data }), { kind: 'dated', dueOn: '2026-11-12', overdue: false, activityId: 'a' })
})

test('Undated next step is unscheduled; missing next-step record is none', () => {
  const undated = summarizeStageActivities('under_construction', [row('a', null, 1)], [], TODAY)
  assert.deepEqual(nextStepDue({ stageActivities: undated }), { kind: 'unscheduled', activityId: 'a' })
  assert.deepEqual(nextStepDue({ stageActivities: null }), { kind: 'none' })
  assert.deepEqual(nextStepDue({ stageActivities: { state: 'empty' } }), { kind: 'none' })
  assert.deepEqual(nextStepDue({ stageActivities: { state: 'unavailable' } }), { kind: 'none' })
  assert.deepEqual(nextStepDue({ stageActivities: { state: 'complete', completed: 2, total: 2 } }), { kind: 'none' })
})

test('Closeout next step uses its own action item date, never overdue styling', () => {
  assert.deepEqual(nextStepDue({ closeoutReason: 'Sign-off', closeoutDueOn: '2026-11-10', stageActivities: null }), {
    kind: 'dated',
    dueOn: '2026-11-10',
    overdue: false,
    activityId: null,
  })
  assert.deepEqual(nextStepDue({ closeoutReason: 'Sign-off', closeoutDueOn: null, stageActivities: null }), {
    kind: 'unscheduled',
    activityId: null,
  })
})

test('Due label: Today, same-year compact date, other-year includes year, no timezone shift', () => {
  assert.deepEqual(dueDateLabel(TODAY, TODAY), { text: 'Today', isToday: true })
  assert.deepEqual(dueDateLabel('2026-12-01', TODAY), { text: 'Dec 1', isToday: false })
  assert.deepEqual(dueDateLabel('2027-01-01', TODAY), { text: 'Jan 1, 2027', isToday: false })
  assert.deepEqual(dueDateLabel('2025-12-31', TODAY), { text: 'Dec 31, 2025', isToday: false })
})
