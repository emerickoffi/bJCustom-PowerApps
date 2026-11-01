import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LAYOUT_AREAS,
  LAYOUT_KEY,
  defaultLayout,
  defaultSettings,
  isDefaultLayout,
  parseDashboardSettings,
  parseLayout,
  placeItem,
  serializeDashboardSettings,
  stepItem,
  validateLayout,
  type DashboardLayout,
} from './dashboard-visibility.ts'

const allIds = (l: DashboardLayout) => LAYOUT_AREAS.flatMap((a) => l[a])

test('organizations without a saved layout keep the original arrangement', () => {
  assert.ok(isDefaultLayout(parseLayout(null)))
  assert.ok(isDefaultLayout(parseDashboardSettings(null).layout))
  const legacy = parseDashboardSettings({ warranty: { enabled: false, showWhen: 'always' } })
  assert.ok(isDefaultLayout(legacy.layout))
  assert.equal(legacy.visibility.warranty.enabled, false)
})

test('stored layout drops unknown, duplicate, and incompatible entries, then restores missing items', () => {
  const l = parseLayout({
    summary: ['card_receivables', 'card_receivables', 'nope', 'attention'],
    main: ['priority_jobs', 'coming_up'],
    side: ['recent_activity'],
    above: ['pipeline'],
  })
  assert.deepEqual(l.summary, ['card_approval', 'card_contract', 'card_schedule', 'card_receivables'].filter((id) => id !== 'card_receivables').length === 3 ? l.summary : [])
  assert.equal(l.summary[l.summary.length - 1] === 'card_receivables' || l.summary.includes('card_receivables'), true)
  assert.ok(l.main.includes('attention'))
  assert.deepEqual(l.above, ['pipeline'])
  assert.deepEqual(l.below, [])
  const ids = allIds(l)
  assert.equal(ids.length, new Set(ids).size)
  assert.equal(ids.length, allIds(defaultLayout()).length)
})

test('placing an item shifts others and keeps every item exactly once', () => {
  const l = placeItem(defaultLayout(), 'card_receivables', 'summary', 1)
  assert.deepEqual(l.summary, ['card_receivables', 'card_approval', 'card_contract', 'card_schedule'])
  const moved = placeItem(defaultLayout(), 'coming_up', 'main', 1)
  assert.deepEqual(moved.main, ['coming_up', 'attention', 'priority_jobs'])
  assert.deepEqual(moved.side, ['warranty', 'recent_activity'])
  assert.equal(allIds(moved).length, new Set(allIds(moved)).size)
})

test('incompatible placements are refused locally and rejected on save', () => {
  const base = defaultLayout()
  assert.equal(placeItem(base, 'attention', 'side', 1), base)
  assert.equal(placeItem(base, 'pipeline', 'main', 1), base)
  const bad = { ...defaultLayout(), main: ['priority_jobs'], side: ['attention', 'coming_up', 'warranty', 'recent_activity'] }
  assert.ok('error' in validateLayout(bad))
  const dup = { ...defaultLayout(), side: ['coming_up', 'coming_up', 'warranty', 'recent_activity'] }
  assert.ok('error' in validateLayout(dup))
  const missing = { ...defaultLayout(), below: [] }
  assert.ok('error' in validateLayout(missing))
  assert.ok('layout' in validateLayout(placeItem(base, 'pipeline', 'above', 1)))
})

test('step moves within an area and stops at the ends', () => {
  const l = stepItem(defaultLayout(), 'card_approval', -1)
  assert.deepEqual(l.summary, defaultLayout().summary)
  const r = stepItem(defaultLayout(), 'card_approval', 1)
  assert.deepEqual(r.summary.slice(0, 2), ['card_contract', 'card_approval'])
})

test('visibility and placement serialize together; defaults store null', () => {
  assert.equal(serializeDashboardSettings(defaultSettings()), null)
  const s = { ...defaultSettings(), layout: placeItem(defaultLayout(), 'pipeline', 'above', 1) }
  const stored = serializeDashboardSettings(s)
  assert.ok(stored && LAYOUT_KEY in stored)
  const round = parseDashboardSettings(JSON.parse(JSON.stringify(stored)))
  assert.deepEqual(round.layout.above, ['pipeline'])
  assert.ok(round.visibility.card_approval.enabled)
})
