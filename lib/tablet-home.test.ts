import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultLayout } from './dashboard-visibility.ts'
import { parseTabletTab, tabletSections } from './tablet-home.ts'

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
  assert.deepEqual([...today].sort(), ['attention', 'coming_up'])
  assert.deepEqual(jobs, ['priority_jobs'])
  assert.deepEqual([...overview].sort(), ['pipeline', 'recent_activity', 'warranty'])
})

test('tablet tabs keep the relative saved order across desktop areas', () => {
  const layout = { ...defaultLayout(), above: ['recent_activity' as const], main: ['warranty' as const], side: ['pipeline' as const], below: [] }
  assert.deepEqual(tabletSections(layout, 'overview', all), ['recent_activity', 'warranty', 'pipeline'])
})

test('hidden sections leave no slot', () => {
  const layout = defaultLayout()
  assert.deepEqual(tabletSections(layout, 'jobs', (id) => id !== 'priority_jobs'), [])
  assert.ok(!tabletSections(layout, 'today', (id) => id !== 'coming_up').includes('coming_up'))
})
