import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getActiveProjectNavKey, getProjectNavItems, type ProjectNavAccess } from './project-nav.ts'

const ID = '7f3c2a10-0000-4000-8000-000000000001'
const BASE = `/projects/${ID}`

const allOn: ProjectNavAccess = {
  features: { schedule: true, estimates: true, documents: true, walkthroughs: true, warranty: true },
  projectStatus: 'completed',
  canViewInternal: true,
}

const keys = (access: ProjectNavAccess) => getProjectNavItems(ID, access).map((i) => i.key)

test('shows every tab in order when all features are on', () => {
  assert.deepEqual(keys(allOn), ['overview', 'schedule', 'estimates', 'documents', 'team', 'walkthroughs', 'warranty'])
})

test('every tab stays inside the current project', () => {
  for (const item of getProjectNavItems(ID, allOn)) {
    assert.ok(item.href === BASE || item.href.startsWith(`${BASE}/`) || item.href.startsWith(`${BASE}#`), item.href)
  }
})

test('hides tabs for disabled organization features', () => {
  const access: ProjectNavAccess = {
    ...allOn,
    features: { schedule: false, estimates: false, documents: false, walkthroughs: false, warranty: false },
  }
  assert.deepEqual(keys(access), ['overview', 'team'])
})

test('hides Documents when the user cannot view internal project data', () => {
  assert.ok(!keys({ ...allOn, canViewInternal: false }).includes('documents'))
})

test('shows Warranty only for completed projects', () => {
  assert.ok(!keys({ ...allOn, projectStatus: 'under_construction' }).includes('warranty'))
})

test('section tabs link to overview anchors', () => {
  const items = getProjectNavItems(ID, allOn)
  assert.equal(items.find((i) => i.key === 'estimates')?.href, `${BASE}#estimates-heading`)
  assert.equal(items.find((i) => i.key === 'team')?.href, `${BASE}#project-team`)
  assert.equal(items.find((i) => i.key === 'walkthroughs')?.href, `${BASE}#walkthroughs-heading`)
})

test('resolves the active tab from the pathname', () => {
  const items = getProjectNavItems(ID, allOn)
  assert.equal(getActiveProjectNavKey(BASE, ID, items), 'overview')
  assert.equal(getActiveProjectNavKey(`${BASE}/`, ID, items), 'overview')
  assert.equal(getActiveProjectNavKey(`${BASE}/schedule`, ID, items), 'schedule')
  assert.equal(getActiveProjectNavKey(`${BASE}/documents`, ID, items), 'documents')
  assert.equal(getActiveProjectNavKey(`${BASE}/walkthroughs/new`, ID, items), 'walkthroughs')
  assert.equal(getActiveProjectNavKey(`${BASE}/warranty`, ID, items), 'warranty')
  assert.equal(getActiveProjectNavKey(`${BASE}/edit`, ID, items), null)
  assert.equal(getActiveProjectNavKey(`${BASE}/schedule-old`, ID, items), null)
})

test('does not mark a hidden tab active', () => {
  const items = getProjectNavItems(ID, { ...allOn, features: { ...allOn.features, schedule: false } })
  assert.equal(getActiveProjectNavKey(`${BASE}/schedule`, ID, items), null)
})
