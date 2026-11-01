import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeStageActivities, type StageActivityRow } from './stage-activities.ts'

const TODAY = '2026-11-05'
let seq = 0
const row = (o: Partial<StageActivityRow>): StageActivityRow => ({
  id: `a${++seq}`,
  project_id: 'p1',
  name: 'Activity',
  phase: 'Preconstruction',
  status: 'not_started',
  planned_end: null,
  sort_order: seq,
  ...o,
})

test('only current-stage activities are counted; not applicable is excluded', () => {
  const r = summarizeStageActivities(
    'preconstruction',
    [
      row({ status: 'completed' }),
      row({ status: 'skipped' }),
      row({ name: 'Permit approval', planned_end: '2026-11-06' }),
      row({ phase: 'Site work', planned_end: '2026-11-01' }),
    ],
    [],
    TODAY,
  )
  assert.equal(r?.state, 'next')
  if (r?.state !== 'next') return
  assert.equal(r.total, 2)
  assert.equal(r.completed, 1)
  assert.equal(r.activity.name, 'Permit approval')
  assert.equal(r.activity.overdue, false)
})

test('dependencies win over due date; undated last; overdue flagged', () => {
  const pred = row({ phase: 'Foundation', name: 'Footings', planned_end: '2026-11-10' })
  const blocked = row({ phase: 'Structure', name: 'Framing', planned_end: '2026-11-01' })
  const undated = row({ phase: 'Exterior', name: 'Siding' })
  const r = summarizeStageActivities(
    'under_construction',
    [pred, blocked, undated],
    [{ predecessor_id: pred.id, successor_id: blocked.id }],
    TODAY,
  )
  assert.equal(r?.state === 'next' && r.activity.name, 'Footings')

  const late = summarizeStageActivities('under_construction', [blocked], [], TODAY)
  assert.equal(late?.state === 'next' && late.activity.overdue, true)
})

test('a real activity whose title matches the stage name is kept, not replaced or dropped', () => {
  const gate = row({ name: 'Preconstruction', phase: 'Preconstruction' })
  const r = summarizeStageActivities(
    'preconstruction',
    [gate, row({ name: 'Site Preparation', phase: 'Site work' })],
    [],
    TODAY,
  )
  assert.equal(r?.state, 'next')
  if (r?.state !== 'next') return
  assert.equal(r.activity.id, gate.id)
  assert.equal(r.total, 1)
  assert.equal(r.completed, 0)
})

test('every open activity waiting on an incomplete predecessor is reported as blocked, not empty', () => {
  const outside = row({ phase: 'Site work', name: 'Site Preparation' })
  const waiting = row({ name: 'Permit approval', activity_type: 'milestone' })
  const r = summarizeStageActivities(
    'preconstruction',
    [outside, waiting],
    [{ predecessor_id: outside.id, successor_id: waiting.id }],
    TODAY,
  )
  assert.equal(r?.state, 'blocked')
  if (r?.state !== 'blocked') return
  assert.equal(r.activity.id, waiting.id)
  assert.equal(r.activity.type, 'milestone')
  assert.equal(r.total, 1)
})

test('empty, complete, and stages without a working schedule', () => {
  assert.deepEqual(summarizeStageActivities('preconstruction', [row({ phase: 'Closeout' })], [], TODAY), { state: 'empty' })
  assert.deepEqual(summarizeStageActivities('punch_list', [row({ phase: 'Closeout', status: 'completed' })], [], TODAY), {
    state: 'complete',
    completed: 1,
    total: 1,
  })
  assert.equal(summarizeStageActivities('on_hold', [row({})], [], TODAY), null)
  assert.equal(summarizeStageActivities('completed', [row({})], [], TODAY), null)
})
