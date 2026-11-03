import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_FILTERS,
  analyzeDependencies,
  chartRange,
  cycleDependencyIds,
  dayNumber,
  firstSaturdayOffset,
  fitZoom,
  headerTicks,
  isoFromDay,
  matchesFilters,
  phaseSpan,
  placeActivity,
} from './schedule-gantt.ts'

const task = (planned_start: string | null, planned_end: string | null) => ({ activity_type: 'task' as const, planned_start, planned_end })

test('date-only values round-trip without timezone shift', () => {
  for (const iso of ['2026-03-08', '2026-11-01', '2024-02-29', '2026-12-31']) {
    assert.equal(isoFromDay(dayNumber(iso)!), iso)
  }
  assert.equal(dayNumber('2026-02-30'), null)
  assert.equal(dayNumber('03/04/2026'), null)
})

test('bars need both planned dates; finish is inclusive', () => {
  assert.deepEqual(placeActivity(task('2026-03-02', '2026-03-02')), { kind: 'bar', start: dayNumber('2026-03-02'), end: dayNumber('2026-03-02') })
  assert.deepEqual(placeActivity(task(null, null)), { kind: 'incomplete', reason: 'undated' })
  assert.deepEqual(placeActivity(task('2026-03-02', null)), { kind: 'incomplete', reason: 'missing_finish' })
  assert.deepEqual(placeActivity(task(null, '2026-03-02')), { kind: 'incomplete', reason: 'missing_start' })
  assert.deepEqual(placeActivity(task('2026-03-05', '2026-03-02')), { kind: 'incomplete', reason: 'invalid_range' })
  assert.deepEqual(placeActivity(task('2026-13-05', '2026-03-02')), { kind: 'incomplete', reason: 'invalid_date' })
})

test('milestones are points only when the record type is milestone', () => {
  const m = { activity_type: 'milestone' as const, planned_start: null, planned_end: '2026-04-10' }
  assert.deepEqual(placeActivity(m), { kind: 'milestone', day: dayNumber('2026-04-10') })
  assert.deepEqual(placeActivity({ ...m, planned_start: '2026-04-12' }), { kind: 'incomplete', reason: 'invalid_range' })
  assert.equal(placeActivity({ ...m, activity_type: 'inspection' }).kind, 'incomplete')
})

test('phase span uses only valid child placements', () => {
  const span = phaseSpan([placeActivity(task('2026-03-02', '2026-03-06')), placeActivity(task(null, null)), placeActivity(task('2026-03-10', '2026-03-12'))])
  assert.deepEqual(span, { start: dayNumber('2026-03-02'), end: dayNumber('2026-03-12') })
  assert.equal(phaseSpan([placeActivity(task(null, null))]), null)
})

test('cycles and missing references are reported, not drawn', () => {
  const deps = [
    { id: 'ab', predecessor_id: 'a', successor_id: 'b' },
    { id: 'bc', predecessor_id: 'b', successor_id: 'c' },
    { id: 'cb', predecessor_id: 'c', successor_id: 'b' },
    { id: 'self', predecessor_id: 'd', successor_id: 'd' },
    { id: 'gone', predecessor_id: 'x', successor_id: 'a' },
  ]
  assert.deepEqual([...cycleDependencyIds(deps)].sort(), ['bc', 'cb', 'self'])
  const ids = new Set(['a', 'b', 'c', 'd'])
  const states = Object.fromEntries(analyzeDependencies(deps, ids, new Set(['b'])).map((r) => [r.dep.id, r.state]))
  assert.deepEqual(states, { ab: 'hidden_predecessor', bc: 'cycle', cb: 'cycle', self: 'cycle', gone: 'missing' })
  assert.equal(analyzeDependencies([deps[0]], ids, new Set(['a', 'b']))[0].state, 'drawn')
  assert.equal(analyzeDependencies([deps[0]], ids, new Set(['a']))[0].state, 'hidden_successor')
})

test('range, fit, ticks, and weekend offset', () => {
  const today = dayNumber('2026-03-04')!
  assert.deepEqual(chartRange([], today), { start: today - 14, end: today + 60 })
  assert.equal(fitZoom(20, 800), 'day')
  assert.equal(fitZoom(50, 800), 'week')
  assert.equal(fitZoom(400, 800), 'month')
  const start = dayNumber('2026-03-01')!
  const weeks = headerTicks(start, start + 13, 'week').minor.map((t) => t.label)
  assert.deepEqual(weeks, ['Mar 2', 'Mar 9'])
  assert.equal(firstSaturdayOffset(start), 6)
})

test('filters combine search, phase, status, assignee, and subcontractor', () => {
  const a = { id: '1', name: 'Pour footings', phase: 'Foundation', status: 'in_progress' as const, assigned_to: 'u1' }
  const companies = (id: string) => (id === '1' ? ['co1'] : [])
  assert.equal(matchesFilters(a, EMPTY_FILTERS, companies), true)
  assert.equal(matchesFilters(a, { ...EMPTY_FILTERS, search: 'foot' }, companies), true)
  assert.equal(matchesFilters(a, { ...EMPTY_FILTERS, phase: 'Framing' }, companies), false)
  assert.equal(matchesFilters(a, { ...EMPTY_FILTERS, status: 'completed' }, companies), false)
  assert.equal(matchesFilters(a, { ...EMPTY_FILTERS, assignee: 'u2' }, companies), false)
  assert.equal(matchesFilters(a, { ...EMPTY_FILTERS, company: 'co1' }, companies), true)
})
