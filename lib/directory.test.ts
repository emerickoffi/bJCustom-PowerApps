import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CLIENT_SORTS,
  DIRECTORY_PAGE_SIZES,
  PROJECT_SORTS,
  directoryHref,
  pageBounds,
  pageItems,
  parsePage,
  parsePageSize,
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

test('pageBounds produces inclusive ranges for the default and chosen sizes', () => {
  assert.deepEqual(pageBounds(1), { from: 0, to: 11 })
  assert.deepEqual(pageBounds(3), { from: 24, to: 35 })
  assert.deepEqual(pageBounds(2, 48), { from: 48, to: 95 })
})

test('parsePageSize accepts only 12, 24, or 48', () => {
  assert.equal(parsePageSize(undefined), 12)
  assert.equal(parsePageSize('24'), 24)
  assert.equal(parsePageSize('48'), 48)
  assert.equal(parsePageSize('20'), 12)
  assert.equal(parsePageSize('1000'), 12)
  assert.equal(parsePageSize('abc'), 12)
})

test('every page size covers 87 records without gaps or overlap', () => {
  const total = 87
  const ids = Array.from({ length: total }, (_, i) => i)
  for (const size of DIRECTORY_PAGE_SIZES) {
    const seen: number[] = []
    for (let page = 1; page <= totalPages(total, size); page++) {
      const { from, to } = pageBounds(page, size)
      const slice = ids.slice(from, to + 1)
      const range = resultRange(page, slice.length, total, size)
      assert.equal(range.start, from + 1)
      assert.equal(range.end, from + slice.length)
      seen.push(...slice)
    }
    assert.deepEqual(seen, ids)
  }
  assert.equal(totalPages(87, 12), 8)
  assert.deepEqual(resultRange(8, 3, 87, 12), { start: 85, end: 87 })
})

test('pageItems compacts long ranges with ellipses around the current page', () => {
  assert.deepEqual(pageItems(1, 1), [1])
  assert.deepEqual(pageItems(3, 7), [1, 2, 3, 4, 5, 6, 7])
  assert.deepEqual(pageItems(1, 20), [1, 2, 3, 4, 5, 'ellipsis-end', 20])
  assert.deepEqual(pageItems(4, 20), [1, 2, 3, 4, 5, 'ellipsis-end', 20])
  assert.deepEqual(pageItems(10, 20), [1, 'ellipsis-start', 9, 10, 11, 'ellipsis-end', 20])
  assert.deepEqual(pageItems(20, 20), [1, 'ellipsis-start', 16, 17, 18, 19, 20])
  for (let page = 1; page <= 20; page++) {
    const items = pageItems(page, 20)
    assert.ok(items.includes(page))
    assert.ok(items.length <= 7)
  }
})

test('pagination covers a 134-record synthetic portfolio without gaps or overlap', () => {
  const total = 134
  const ids = Array.from({ length: total }, (_, i) => i)
  const pages = totalPages(total)
  assert.equal(pages, 12)
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
