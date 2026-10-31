import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveScheduleSelection, scheduleHref } from './schedule-selection.ts'

const ids = ['p-yaupon', 'p-oak']

test('no parameter selects nothing (no default project)', () => {
  assert.deepEqual(resolveScheduleSelection({}, ids), { kind: 'none' })
  assert.deepEqual(resolveScheduleSelection({ projectId: '  ' }, ids), { kind: 'none' })
})

test('authorized projectId is selected', () => {
  assert.deepEqual(resolveScheduleSelection({ projectId: 'p-oak' }, ids), { kind: 'project', projectId: 'p-oak' })
})

test('legacy project key still works, projectId wins', () => {
  assert.deepEqual(resolveScheduleSelection({ project: 'p-oak' }, ids), { kind: 'project', projectId: 'p-oak' })
  assert.deepEqual(resolveScheduleSelection({ projectId: 'p-yaupon', project: 'p-oak' }, ids), {
    kind: 'project',
    projectId: 'p-yaupon',
  })
})

test('unknown or unauthorized id never falls back to another project', () => {
  assert.deepEqual(resolveScheduleSelection({ projectId: 'p-other-org' }, ids), {
    kind: 'unavailable',
    requestedId: 'p-other-org',
  })
  assert.deepEqual(resolveScheduleSelection({ projectId: 'p-oak' }, []), { kind: 'unavailable', requestedId: 'p-oak' })
})

test('explicit all-projects overview is preserved', () => {
  assert.deepEqual(resolveScheduleSelection({ projectId: 'all' }, ids), { kind: 'all' })
})

test('array params use the first value', () => {
  assert.deepEqual(resolveScheduleSelection({ projectId: ['p-oak', 'p-yaupon'] }, ids), { kind: 'project', projectId: 'p-oak' })
})

test('scheduleHref encodes the id', () => {
  assert.equal(scheduleHref('a b'), '/schedule?projectId=a%20b')
})
