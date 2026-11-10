import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectSetup, type ProjectSetupInput } from './project-setup.ts'

const input = (partial: Partial<ProjectSetupInput> = {}): ProjectSetupInput => ({
  projectId: 'p1',
  features: { schedule: true, documents: true, estimates: true },
  hasProjectManager: false,
  hasHomeowner: false,
  hasTeam: false,
  hasSchedule: false,
  hasDocuments: false,
  hasEstimate: false,
  teamAnchor: 'team',
  ...partial,
})

test('completion is derived from records', () => {
  const setup = buildProjectSetup(input({ hasProjectManager: true, hasSchedule: true }))
  assert.equal(setup.steps.length, 6)
  assert.equal(setup.doneCount, 2)
  assert.equal(setup.complete, false)
  assert.deepEqual(
    setup.steps.filter((s) => s.state === 'done').map((s) => s.key),
    ['manager', 'schedule'],
  )
})

test('all records present marks setup complete', () => {
  const all = { hasProjectManager: true, hasHomeowner: true, hasTeam: true, hasSchedule: true, hasDocuments: true, hasEstimate: true }
  assert.equal(buildProjectSetup(input(all)).complete, true)
})

test('failed lookups are unknown, never counted as done or missing', () => {
  const setup = buildProjectSetup(input({ hasDocuments: null }))
  assert.equal(setup.steps.find((s) => s.key === 'documents')?.state, 'unknown')
  assert.equal(setup.doneCount, 0)
  assert.equal(setup.complete, false)
})

test('disabled modules drop their steps', () => {
  const setup = buildProjectSetup(
    input({ features: { schedule: false, documents: false, estimates: false }, hasProjectManager: true, hasHomeowner: true, hasTeam: true }),
  )
  assert.deepEqual(setup.steps.map((s) => s.key), ['manager', 'homeowner', 'team'])
  assert.equal(setup.complete, true)
})

test('actions link to existing workflows', () => {
  const hrefs = Object.fromEntries(buildProjectSetup(input()).steps.map((s) => [s.key, s.href]))
  assert.equal(hrefs.manager, '/projects/p1/edit')
  assert.equal(hrefs.homeowner, '/projects/p1#team')
  assert.equal(hrefs.team, '/projects/p1/contacts/add')
  assert.equal(hrefs.estimate, '/estimates/new?project=p1')
})
