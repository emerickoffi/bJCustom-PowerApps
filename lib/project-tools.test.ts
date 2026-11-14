import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  filterProjectToolGroups,
  getActiveProjectToolKey,
  getProjectToolGroups,
  type ProjectNavAccess,
} from './project-nav.ts'

const ID = '7f3c2a10-0000-4000-8000-000000000001'
const BASE = `/projects/${ID}`

const everything: ProjectNavAccess = {
  features: {
    schedule: true, estimates: true, documents: true, walkthroughs: true, warranty: true,
    change_orders: true, daily_logs: true, client_updates: true, subcontractors: true, rfis: true, project_photos: true,
  },
  projectStatus: 'completed',
  canViewInternal: true,
  canViewFinancials: true,
}

const layout = (access: ProjectNavAccess) =>
  Object.fromEntries(getProjectToolGroups(ID, access).map((g) => [g.key, g.tools.map((t) => t.key)]))

test('groups every tool exactly once in the agreed order', () => {
  assert.deepEqual(layout(everything), {
    work: ['overview', 'schedule', 'daily_logs', 'selections', 'walkthroughs', 'warranty'],
    financials: ['estimates', 'change_orders', 'financials'],
    people: ['contacts', 'subcontractor_work', 'rfis', 'client_updates'],
    files: ['documents', 'photos'],
  })
  const all = getProjectToolGroups(ID, everything).flatMap((g) => g.tools.map((t) => t.key))
  assert.equal(new Set(all).size, all.length)
})

test('staff without manager rights never see financial tools, in the menu or search', () => {
  const staff = { ...everything, canViewFinancials: false }
  const groups = getProjectToolGroups(ID, staff)
  assert.equal(groups.find((g) => g.key === 'financials')?.tools.map((t) => t.key).join(), 'estimates')
  assert.deepEqual(filterProjectToolGroups(groups, 'change order'), [])
  assert.deepEqual(filterProjectToolGroups(groups, 'sub work'), [])
})

test('users without internal access see neither RFIs nor internal tools', () => {
  const keys = getProjectToolGroups(ID, { ...everything, canViewInternal: false }).flatMap((g) => g.tools.map((t) => t.key))
  for (const hidden of ['rfis', 'documents', 'daily_logs', 'photos', 'client_updates']) assert.ok(!keys.includes(hidden as never), hidden)
})

test('disabled features drop their tools and empty groups', () => {
  const minimal: ProjectNavAccess = {
    features: { schedule: false, estimates: false, documents: false, walkthroughs: false, warranty: false },
    projectStatus: 'active',
    canViewInternal: true,
  }
  assert.deepEqual(layout(minimal), { work: ['overview'], people: ['contacts'] })
})

test('search finds Questions by RFI and by name, and hides unmatched groups', () => {
  const groups = getProjectToolGroups(ID, everything)
  for (const q of ['RFI', 'rfis', 'Questions', 'request for info']) {
    const result = filterProjectToolGroups(groups, q)
    assert.deepEqual(result.map((g) => g.key), ['people'], q)
    assert.deepEqual(result[0].tools.map((t) => t.key), ['rfis'], q)
  }
  assert.deepEqual(filterProjectToolGroups(groups, 'zzz'), [])
  assert.equal(filterProjectToolGroups(groups, '   ').length, groups.length)
})

test('resolves the active tool from the URL, including RFIs and nested pages', () => {
  const tools = getProjectToolGroups(ID, everything).flatMap((g) => g.tools)
  assert.equal(getActiveProjectToolKey(BASE, ID, tools), 'overview')
  assert.equal(getActiveProjectToolKey(`${BASE}/`, ID, tools), 'overview')
  assert.equal(getActiveProjectToolKey(`${BASE}/rfis`, ID, tools), 'rfis')
  assert.equal(getActiveProjectToolKey(`${BASE}/schedule/abc`, ID, tools), 'schedule')
  assert.equal(getActiveProjectToolKey(`${BASE}/edit`, ID, tools), null)
})
