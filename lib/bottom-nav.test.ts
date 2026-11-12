import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bottomNavTabs, isTabActive } from './bottom-nav.ts'

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
