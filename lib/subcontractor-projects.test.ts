import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSelectedProjects, groupAssignedProjects, parseProjectIds, MAX_PROJECT_ASSIGNMENTS } from './subcontractor-projects.ts'

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
