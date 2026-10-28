import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignedProjectsFilter, splitAssignedActivities } from './my-work.ts'
import { landingPathForRole } from './navigation.ts'

const TODAY = '2026-10-28'

test('splitAssignedActivities flags delayed and past-due work and drops finished items', () => {
  const rows = [
    { id: 'a', status: 'not_started' as const, planned_end: '2026-11-04' },
    { id: 'b', status: 'in_progress' as const, planned_end: '2026-10-20' },
    { id: 'c', status: 'delayed' as const, planned_end: '2026-12-01' },
    { id: 'd', status: 'completed' as const, planned_end: '2026-10-01' },
    { id: 'e', status: 'skipped' as const, planned_end: null },
    { id: 'f', status: 'not_started' as const, planned_end: null },
  ]
  const { attention, upcoming } = splitAssignedActivities(rows, TODAY)
  assert.deepEqual(attention.map((r) => r.id), ['b', 'c'])
  assert.deepEqual(upcoming.map((r) => r.id), ['a', 'f'])
})

test('assignedProjectsFilter covers managed and member projects', () => {
  assert.equal(assignedProjectsFilter('u1', []), 'project_manager_id.eq.u1')
  assert.equal(assignedProjectsFilter('u1', ['p1', 'p2']), 'project_manager_id.eq.u1,id.in.(p1,p2)')
})

test('landingPathForRole sends each role to its home workspace', () => {
  assert.equal(landingPathForRole('client'), '/portal')
  assert.equal(landingPathForRole('project_manager'), '/my-work')
  assert.equal(landingPathForRole('org_admin'), '/dashboard')
  assert.equal(landingPathForRole('builder_staff'), '/dashboard')
  assert.equal(landingPathForRole(null), '/dashboard')
})
