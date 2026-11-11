import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultLayout } from './dashboard-visibility.ts'
import { buildTabletShortcuts, parseTabletTab, tabletSections } from './tablet-home.ts'

const all = () => true

test('tablet tabs fall back to Today for unknown values', () => {
  assert.equal(parseTabletTab(undefined), 'today')
  assert.equal(parseTabletTab('nope'), 'today')
  assert.equal(parseTabletTab('jobs'), 'jobs')
  assert.equal(parseTabletTab('overview'), 'overview')
})

test('each section lands in exactly one tablet tab', () => {
  const layout = defaultLayout()
  const today = tabletSections(layout, 'today', all)
  const jobs = tabletSections(layout, 'jobs', all)
  const overview = tabletSections(layout, 'overview', all)
  assert.deepEqual([...today].sort(), ['attention', 'coming_up', 'my_todos'])
  assert.deepEqual(jobs, ['priority_jobs'])
  assert.deepEqual([...overview].sort(), ['pipeline', 'recent_activity'])
})

test('tablet tabs keep the relative saved order across desktop areas', () => {
  const layout = { ...defaultLayout(), above: ['coming_up' as const], main: ['my_todos' as const], side: ['attention' as const], below: [] }
  assert.deepEqual(tabletSections(layout, 'today', all), ['coming_up', 'my_todos', 'attention'])
})

test('hidden sections leave no slot', () => {
  const layout = defaultLayout()
  assert.deepEqual(tabletSections(layout, 'jobs', (id) => id !== 'priority_jobs'), [])
  assert.ok(!tabletSections(layout, 'today', (id) => id !== 'coming_up').includes('coming_up'))
})

test('shortcuts with All projects open unscoped pages that ask for a project', () => {
  const s = buildTabletShortcuts({ role: 'org_admin', features: { daily_logs: true, documents: true }, project: null })
  assert.deepEqual(
    s.map((x) => [x.key, x.href]),
    [
      ['daily_log', '/daily-logs/new'],
      ['documents', '/documents'],
    ],
  )
})

test('shortcuts carry the selected project', () => {
  const s = buildTabletShortcuts({
    role: 'project_manager',
    features: { daily_logs: true, documents: true },
    project: { id: 'p 1', name: 'Yaupon Dr' },
  })
  assert.equal(s[0].href, '/daily-logs/new?project=p%201')
  assert.equal(s[1].href, '/documents?project=p%201')
  assert.equal(s[0].hint, 'Yaupon Dr')
})

test('shortcuts are omitted when the module or role is unavailable', () => {
  assert.deepEqual(buildTabletShortcuts({ role: 'org_admin', features: {}, project: null }), [])
  assert.deepEqual(
    buildTabletShortcuts({ role: null, features: { daily_logs: true }, project: null }).map((x) => x.key),
    [],
  )
})
