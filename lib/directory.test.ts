import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENT_SORTS,
  PROJECT_SORTS,
  directoryHref,
  pageBounds,
  parsePage,
  parseSort,
  parseView,
  resultRange,
  totalPages,
} from './directory.ts'

test('parseView accepts only cards or table', () => {
  assert.equal(parseView('cards'), 'cards')
  assert.equal(parseView('table'), 'table')
  assert.equal(parseView('grid'), null)
  assert.equal(parseView(undefined), null)
})

test('parsePage rejects invalid values and caps extremes', () => {
  assert.equal(parsePage(undefined), 1)
  assert.equal(parsePage('0'), 1)
  assert.equal(parsePage('-3'), 1)
  assert.equal(parsePage('2.5'), 1)
  assert.equal(parsePage('abc'), 1)
  assert.equal(parsePage('4'), 4)
  assert.equal(parsePage('99999999'), 10_000)
})

test('pageBounds produces 20-record inclusive ranges', () => {
  assert.deepEqual(pageBounds(1), { from: 0, to: 19 })
  assert.deepEqual(pageBounds(6), { from: 100, to: 119 })
})

test('pagination covers a 134-record synthetic portfolio without gaps or overlap', () => {
  const total = 134
  const ids = Array.from({ length: total }, (_, i) => i)
  const pages = totalPages(total)
  assert.equal(pages, 7)
  const seen: number[] = []
  for (let page = 1; page <= pages; page++) {
    const { from, to } = pageBounds(page)
    const slice = ids.slice(from, to + 1)
    const range = resultRange(page, slice.length, total)
    assert.equal(range.end - range.start + 1, slice.length)
    seen.push(...slice)
  }
  assert.deepEqual(seen, ids)
  assert.equal(totalPages(0), 1)
})

test('parseSort falls back for unknown or prototype keys', () => {
  assert.equal(parseSort('recent', CLIENT_SORTS, 'name_asc'), 'recent')
  assert.equal(parseSort('project_count', CLIENT_SORTS, 'name_asc'), 'name_asc')
  assert.equal(parseSort('toString', PROJECT_SORTS, 'updated'), 'updated')
})

test('every sort ends with an id tie-breaker for stable paging', () => {
  for (const def of [...Object.values(CLIENT_SORTS), ...Object.values(PROJECT_SORTS)]) {
    assert.equal(def.orders.at(-1)?.column, 'id')
  }
})

test('directoryHref preserves state and drops empty values and page 1', () => {
  assert.equal(directoryHref('/projects', { q: '', status: 'planning', page: 1, sort: 'name_asc' }), '/projects?status=planning&sort=name_asc')
  assert.equal(directoryHref('/clients', { q: 'smith & co', page: 3 }), '/clients?q=smith+%26+co&page=3')
  assert.equal(directoryHref('/clients', {}), '/clients')
})
