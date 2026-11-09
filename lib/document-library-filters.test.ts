import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLibraryFilters, pickLibraryFilters, serializeLibraryFilters } from './document-library-filters.ts'

test('project library keeps project-only filters and drops page/tab', () => {
  assert.deepEqual(pickLibraryFilters('projects', { q: 'plan', project: 'p1', visibility: 'homeowner', page: '3', tab: 'company' }), {
    q: 'plan',
    project: 'p1',
    visibility: 'homeowner',
  })
})

test('company library drops project and visibility filters', () => {
  assert.deepEqual(pickLibraryFilters('company', { q: 'license', project: 'p1', visibility: 'internal', archived: '1' }), {
    q: 'license',
    archived: '1',
  })
})

test('serialized filters round-trip through the cookie parser', () => {
  const raw = encodeURIComponent(serializeLibraryFilters('projects', { q: 'a & b', category: 'permits' }))
  assert.deepEqual(parseLibraryFilters('projects', raw), { q: 'a & b', category: 'permits' })
})

test('malformed or unknown cookie values are ignored', () => {
  assert.deepEqual(parseLibraryFilters('company', '%E0%A4%A'), {})
  assert.deepEqual(parseLibraryFilters('company', 'evil=1&tab=projects'), {})
  assert.deepEqual(parseLibraryFilters('projects', undefined), {})
})
