import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkSelectedProjects,
  groupAssignedProjects,
  isUuid,
  newProjectIds,
  parseProjectIds,
  MAX_PROJECT_ASSIGNMENTS,
  isAssignmentSetupError,
  parseEndReason,
  splitProjectAssignments,
} from './subcontractor-projects.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const eligible = (s: string) => ['preconstruction', 'under_construction', 'final_inspection', 'punch_list', 'substantially_complete'].includes(s)

test('an empty selection is valid', () => {
  assert.deepEqual(parseProjectIds([]), { ok: true, ids: [] })
  assert.deepEqual(parseProjectIds(['', '  ']), { ok: true, ids: [] })
})

test('duplicate project IDs collapse to one', () => {
  assert.deepEqual(parseProjectIds([A, A.toUpperCase(), ` ${A} `, B]), { ok: true, ids: [A, B] })
})

test('non-UUID and non-string values are rejected', () => {
  assert.equal(parseProjectIds(['not-a-uuid']).ok, false)
  assert.equal(parseProjectIds([A, "1' or '1'='1"]).ok, false)
  assert.equal(parseProjectIds([new Blob()]).ok, false)
})

test('selections above the cap are rejected', () => {
  const many = Array.from({ length: MAX_PROJECT_ASSIGNMENTS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
  assert.equal(parseProjectIds(many).ok, false)
  assert.equal(parseProjectIds(many.slice(0, MAX_PROJECT_ASSIGNMENTS)).ok, true)
})

test('projects outside the authorized lookup are rejected', () => {
  const rows = [{ id: A, status: 'under_construction' }]
  assert.equal(checkSelectedProjects([A], rows, eligible), null)
  assert.match(checkSelectedProjects([A, C], rows, eligible) ?? '', /not available/)
})

test('completed, consultation, and cancelled projects are rejected', () => {
  for (const status of ['completed', 'consultation', 'cancelled', 'on_hold', 'lead']) {
    assert.match(checkSelectedProjects([A], [{ id: A, status }], eligible) ?? '', /preconstruction/)
  }
  for (const status of ['preconstruction', 'under_construction', 'punch_list']) {
    assert.equal(checkSelectedProjects([A], [{ id: A, status }], eligible), null)
  }
})

test('multiple projects are accepted together', () => {
  const rows = [
    { id: A, status: 'preconstruction' },
    { id: B, status: 'under_construction' },
  ]
  assert.equal(checkSelectedProjects([A, B], rows, eligible), null)
})

test('associations group by company in project-number order and skip hidden projects', () => {
  const grouped = groupAssignedProjects([
    { subcontractor_company_id: 'c1', project: { id: B, name: 'Lake House', project_number: 'P1010' } },
    { subcontractor_company_id: 'c1', project: { id: A, name: 'Oak Ridge', project_number: 'P1002' } },
    { subcontractor_company_id: 'c2', project: null },
  ])
  assert.deepEqual(grouped.c1.map((p) => p.project_number), ['P1002', 'P1010'])
  assert.equal(grouped.c2, undefined)
})

test('editing only adds projects that are not already associated', () => {
  assert.deepEqual(newProjectIds([A], [A, B]), [B])
  assert.deepEqual(newProjectIds([A, B], [A, B]), [])
  assert.deepEqual(newProjectIds([], [C, A]), [C, A])
  assert.deepEqual(newProjectIds([A.toUpperCase()], [A]), [])
})

test('existing associations are never returned for removal', () => {
  assert.deepEqual(newProjectIds([A, B], []), [])
})

test('isUuid accepts UUIDs and rejects route garbage', () => {
  assert.equal(isUuid(A), true)
  assert.equal(isUuid('new'), false)
  assert.equal(isUuid("1' or 1=1"), false)
  assert.equal(isUuid(undefined), false)
})

const record = (id: string, status: string, ended_at: string | null, number = id) => ({
  assignment_id: `a-${id}`,
  project: { id, name: `Project ${id}`, project_number: number, status },
  associated_at: '2026-10-01T00:00:00Z',
  ended_at,
  end_reason: null,
})

test('active associations on assignable projects are current; ended and completed ones are history', () => {
  const { current, history } = splitProjectAssignments(
    [
      record('p2', 'under_construction', null, 'BJ-2'),
      record('p1', 'preconstruction', null, 'BJ-10'),
      record('p3', 'completed', null),
      record('p4', 'under_construction', '2026-10-20T00:00:00Z'),
      record('p5', 'cancelled', '2026-10-25T00:00:00Z'),
    ],
    eligible,
  )
  assert.deepEqual(current.map((r) => r.project.id), ['p2', 'p1'])
  assert.deepEqual(history.map((r) => r.project.id), ['p5', 'p4', 'p3'])
})

test('a project can be current and in history when it was ended and assigned again', () => {
  const { current, history } = splitProjectAssignments(
    [record('p1', 'under_construction', '2026-10-05T00:00:00Z'), record('p1', 'under_construction', null)],
    eligible,
  )
  assert.equal(current.length, 1)
  assert.equal(history.length, 1)
})

test('end reasons are optional, trimmed, and length-limited', () => {
  assert.deepEqual(parseEndReason(undefined), { ok: true, reason: null })
  assert.deepEqual(parseEndReason('   '), { ok: true, reason: null })
  assert.deepEqual(parseEndReason(' Scope complete '), { ok: true, reason: 'Scope complete' })
  assert.equal(parseEndReason('x'.repeat(501)).ok, false)
  assert.equal(parseEndReason(42).ok, false)
})

test('missing table, column, or function errors mean setup is required', () => {
  for (const code of ['PGRST205', '42P01', '42703', 'PGRST204', 'PGRST202']) assert.equal(isAssignmentSetupError({ code }), true)
  assert.equal(isAssignmentSetupError({ code: '42501' }), false)
  assert.equal(isAssignmentSetupError(null), false)
})
