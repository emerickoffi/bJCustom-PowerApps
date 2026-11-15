import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectResourceConflicts,
  inclusiveDays,
  projectsInvolved,
  scopeConflicts,
  type ConflictActivity,
  type ConflictAssignment,
  type ConflictProject,
  type DetectionInput,
} from './resource-conflicts.ts'

const ORG = 'org-1'
const project = (id: string, status = 'active', org = ORG): ConflictProject => ({ id, name: `Project ${id}`, organization_id: org, status })
const activity = (id: string, projectId: string, start: string | null, end: string | null, extra: Partial<ConflictActivity> = {}): ConflictActivity => ({
  id,
  project_id: projectId,
  organization_id: ORG,
  name: `Activity ${id}`,
  status: 'not_started',
  planned_start: start,
  planned_end: end,
  assigned_to: null,
  ...extra,
})
const sub = (id: string, activityId: string, projectId: string, company = 'co-1', extra: Partial<ConflictAssignment> = {}): ConflictAssignment => ({
  id,
  organization_id: ORG,
  project_id: projectId,
  schedule_activity_id: activityId,
  subcontractor_company_id: company,
  company_name: 'Acme HVAC',
  ...extra,
})
const input = (over: Partial<DetectionInput>): DetectionInput => ({
  organizationId: ORG,
  projects: [project('p1'), project('p2'), project('p3')],
  activities: [],
  assignments: [],
  staffNames: { 'u-1': 'Dana Lee' },
  ...over,
})

test('inclusiveDays counts both ends', () => {
  assert.equal(inclusiveDays('2026-11-02', '2026-11-02'), 1)
  assert.equal(inclusiveDays('2026-11-02', '2026-11-06'), 5)
  assert.equal(inclusiveDays('2026-02-27', '2026-03-02'), 4)
})

test('subcontractor booked on overlapping dates in two projects is a conflict with the exact overlap', () => {
  const r = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-10'), activity('a2', 'p2', '2026-11-08', '2026-11-20')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p2')],
    }),
  )
  assert.equal(r.conflicts.length, 1)
  const c = r.conflicts[0]
  assert.equal(c.resource.type, 'subcontractor')
  assert.deepEqual(c.overlap, { start: '2026-11-08', end: '2026-11-10', days: 3 })
  assert.match(c.explanation, /Crews are not tracked individually/)
})

test('touching on a single shared day counts; adjacent days do not', () => {
  const touching = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-05'), activity('a2', 'p2', '2026-11-05', '2026-11-09')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p2')],
    }),
  )
  assert.equal(touching.conflicts[0]?.overlap?.days, 1)
  const adjacent = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-05'), activity('a2', 'p2', '2026-11-06', '2026-11-09')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p2')],
    }),
  )
  assert.equal(adjacent.conflicts.length, 0)
})

test('overlaps within a single project are not reported', () => {
  const r = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-10'), activity('a2', 'p1', '2026-11-03', '2026-11-04')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p1')],
    }),
  )
  assert.deepEqual(r, { conflicts: [], cannotAssess: [] })
})

test('staff assignee overlap is detected with the staff name and message', () => {
  const r = detectResourceConflicts(
    input({
      activities: [
        activity('a1', 'p1', '2026-11-02', '2026-11-10', { assigned_to: 'u-1' }),
        activity('a2', 'p2', '2026-11-09', '2026-11-12', { assigned_to: 'u-1' }),
      ],
    }),
  )
  assert.equal(r.conflicts.length, 1)
  assert.equal(r.conflicts[0].resource.name, 'Dana Lee')
  assert.match(r.conflicts[0].explanation, /Confirm they can cover both/)
})

test('completed or skipped activities, closed projects and other organizations are ignored', () => {
  const r = detectResourceConflicts(
    input({
      projects: [project('p1'), project('p2'), project('p3', 'completed'), project('p4', 'active', 'org-2')],
      activities: [
        activity('a1', 'p1', '2026-11-02', '2026-11-10'),
        activity('a2', 'p2', '2026-11-02', '2026-11-10', { status: 'completed' }),
        activity('a3', 'p2', '2026-11-02', '2026-11-10', { status: 'skipped' }),
        activity('a4', 'p3', '2026-11-02', '2026-11-10'),
        activity('a5', 'p4', '2026-11-02', '2026-11-10', { organization_id: 'org-2' }),
      ],
      assignments: [
        sub('s1', 'a1', 'p1'),
        sub('s2', 'a2', 'p2'),
        sub('s3', 'a3', 'p2'),
        sub('s4', 'a4', 'p3'),
        sub('s5', 'a5', 'p4', 'co-1', { organization_id: 'org-2' }),
      ],
    }),
  )
  assert.deepEqual(r, { conflicts: [], cannotAssess: [] })
})

test('assignments whose project does not match their activity are ignored', () => {
  const r = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-10'), activity('a2', 'p2', '2026-11-02', '2026-11-10')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p1')],
    }),
  )
  assert.equal(r.conflicts.length, 0)
})

test('missing or invalid dates are reported as cannot-assess, never as conflicts', () => {
  const r = detectResourceConflicts(
    input({
      activities: [
        activity('a1', 'p1', '2026-11-02', '2026-11-10'),
        activity('a2', 'p2', null, '2026-11-10'),
        activity('a3', 'p3', '2026-11-10', '2026-11-02'),
      ],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p2'), sub('s3', 'a3', 'p3')],
    }),
  )
  assert.equal(r.conflicts.length, 0)
  assert.deepEqual(
    r.cannotAssess.map((u) => [u.activityId, u.reason]),
    [
      ['a2', 'No planned start date'],
      ['a3', 'Planned finish is before planned start'],
    ],
  )
})

test('an activity assigned twice to the same company is counted once', () => {
  const r = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-10'), activity('a2', 'p2', '2026-11-05', '2026-11-06')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s1b', 'a1', 'p1'), sub('s2', 'a2', 'p2')],
    }),
  )
  assert.equal(r.conflicts.length, 1)
})

test('output is deterministic regardless of input order', () => {
  const acts = [
    activity('a1', 'p1', '2026-11-02', '2026-11-10'),
    activity('a2', 'p2', '2026-11-05', '2026-11-12'),
    activity('a3', 'p3', '2026-11-09', '2026-11-15'),
  ]
  const subs = [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p2'), sub('s3', 'a3', 'p3')]
  const forward = detectResourceConflicts(input({ activities: acts, assignments: subs }))
  const reversed = detectResourceConflicts(input({ activities: [...acts].reverse(), assignments: [...subs].reverse() }))
  assert.deepEqual(forward, reversed)
  assert.equal(forward.conflicts.length, 3)
  assert.equal(projectsInvolved(forward.conflicts), 3)
})

test('scoping redacts the inaccessible side and drops the overlap dates', () => {
  const r = detectResourceConflicts(
    input({
      activities: [activity('a1', 'p1', '2026-11-02', '2026-11-10'), activity('a2', 'p2', '2026-11-08', '2026-11-20')],
      assignments: [sub('s1', 'a1', 'p1'), sub('s2', 'a2', 'p2')],
    }),
  )
  const scoped = scopeConflicts(r, { accessibleProjectIds: new Set(['p2']) })
  assert.equal(scoped.conflicts.length, 1)
  const c = scoped.conflicts[0]
  assert.equal(c.first.visible && c.first.projectId, 'p2')
  assert.deepEqual(c.second, { visible: false })
  assert.equal(c.overlap, null)
  const serialized = JSON.stringify(c)
  for (const leaked of ['p1', 'a1', 'Project p1', 'Activity a1', '2026-11-02', '2026-11-10']) {
    assert.ok(!serialized.includes(`"${leaked}"`) && !serialized.includes(`:${leaked}`), `leaked ${leaked}`)
  }
})

test('scoping filters by project, activity and resource', () => {
  const r = detectResourceConflicts(
    input({
      activities: [
        activity('a1', 'p1', '2026-11-02', '2026-11-10', { assigned_to: 'u-1' }),
        activity('a2', 'p2', '2026-11-05', '2026-11-12', { assigned_to: 'u-1' }),
        activity('a3', 'p3', '2026-11-09', '2026-11-15'),
      ],
      assignments: [sub('s2', 'a2', 'p2'), sub('s3', 'a3', 'p3')],
    }),
  )
  const all = new Set(['p1', 'p2', 'p3'])
  assert.equal(r.conflicts.length, 2)
  assert.equal(scopeConflicts(r, { accessibleProjectIds: all, projectId: 'p1' }).conflicts.length, 1)
  assert.equal(scopeConflicts(r, { accessibleProjectIds: all, activityId: 'a3' }).conflicts.length, 1)
  assert.equal(scopeConflicts(r, { accessibleProjectIds: all, resource: { type: 'staff', id: 'u-1' } }).conflicts.length, 1)
  assert.deepEqual(scopeConflicts(r, { accessibleProjectIds: new Set(['p2']), projectId: 'p1' }), { conflicts: [], cannotAssess: [] })
})
