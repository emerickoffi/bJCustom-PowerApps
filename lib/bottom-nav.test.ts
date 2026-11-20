import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bottomNavTabs, isTabActive, phoneNavTabs } from './bottom-nav.ts'

const labels = (hrefs: string[], home = '/dashboard') => bottomNavTabs(hrefs, home).map((t) => t.label)

test('project managers get Home, Projects, My Work and Schedule', () => {
  assert.deepEqual(labels(['/dashboard', '/projects', '/my-work', '/schedule', '/estimates']), ['Home', 'Projects', 'My Work', 'Schedule'])
})

test('tabs a role cannot open are left out', () => {
  assert.deepEqual(labels(['/dashboard', '/projects']), ['Home', 'Projects'])
  assert.deepEqual(labels(['/dashboard', '/projects', '/schedule']), ['Home', 'Projects', 'Schedule'])
})

test('My Work is not repeated when it is already the home page', () => {
  assert.deepEqual(labels(['/my-work', '/projects'], '/my-work'), ['Home', 'Projects'])
})

test('a tab is active on its own page and nested pages only', () => {
  assert.equal(isTabActive('/projects', '/projects'), true)
  assert.equal(isTabActive('/projects/123/walkthroughs', '/projects'), true)
  assert.equal(isTabActive('/projects-archive', '/projects'), false)
})

const phone = (hrefs: string[], home = '/dashboard') => phoneNavTabs(hrefs, home).map((t) => t.label)

test('phones put field tools first', () => {
  const crew = ['/dashboard', '/projects', '/schedule', '/daily-logs', '/time', '/documents']
  assert.deepEqual(phone(crew), ['Home', 'Daily Logs', 'Time', 'Projects'])
})

test('project managers land on My Work on phones', () => {
  const pm = ['/my-work', '/projects', '/schedule', '/daily-logs', '/time']
  assert.deepEqual(phone(pm, '/my-work'), ['My Work', 'Daily Logs', 'Time', 'Projects'])
})

test('phones fill in with Schedule when field modules are off', () => {
  assert.deepEqual(phone(['/dashboard', '/projects', '/schedule']), ['Home', 'Projects', 'Schedule'])
  assert.deepEqual(phone(['/dashboard', '/projects']), ['Home', 'Projects'])
})
