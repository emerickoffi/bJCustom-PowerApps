import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExportFilename,
  categoriesFor,
  likePattern,
  parseHistoryFilters,
  parsePage,
  presentEvent,
  safeCellText,
  wallClockDate,
  zonedMidnightUtc,
  type HistoryEventRow,
} from './activity-history.ts'

const TZ = 'America/Chicago'
const nameFor = (id: string | null) => (id === 'u1' ? 'Pat Builder' : id ? 'Former team member' : null)

test('categoriesFor derives categories only from recorded change keys', () => {
  assert.deepEqual(categoriesFor({ event_type: 'created', changes: {} }), ['created'])
  assert.deepEqual(categoriesFor({ event_type: 'deleted', changes: {} }), ['deleted'])
  assert.deepEqual(
    categoriesFor({ event_type: 'updated', changes: { status: { from: 'a', to: 'b' }, percent_complete: { from: 0, to: 50 } } }),
    ['progress', 'status'],
  )
  assert.deepEqual(categoriesFor({ event_type: 'updated', changes: { planned_end: { from: null, to: '2026-11-01' } } }), ['planned_dates'])
})

test('parseHistoryFilters validates dates, types, actors and length', () => {
  assert.equal(parseHistoryFilters(new URLSearchParams('type=nope')).ok, false)
  assert.equal(parseHistoryFilters(new URLSearchParams('from=2026-02-30')).ok, false)
  assert.equal(parseHistoryFilters(new URLSearchParams('from=2026-10-10&to=2026-10-01')).ok, false)
  assert.equal(parseHistoryFilters(new URLSearchParams('actor=1;drop')).ok, false)
  assert.equal(parseHistoryFilters(new URLSearchParams(`q=${'x'.repeat(101)}`)).ok, false)
  const ok = parseHistoryFilters(new URLSearchParams('q= Framing &type=status&from=2026-10-01&to=2026-10-31&actor=system'))
  assert.ok(ok.ok)
  if (ok.ok) assert.deepEqual(ok.filters, { q: 'Framing', type: 'status', from: '2026-10-01', to: '2026-10-31', actor: 'system' })
})

test('parsePage rejects non-positive or non-numeric pages', () => {
  assert.equal(parsePage(null), 1)
  assert.equal(parsePage('3'), 3)
  assert.equal(parsePage('0'), null)
  assert.equal(parsePage('-1'), null)
  assert.equal(parsePage('1e3'), null)
})

test('likePattern escapes wildcards', () => {
  assert.equal(likePattern('50%_a\\b'), '%50\\%\\_a\\\\b%')
})

test('zonedMidnightUtc handles standard and daylight time', () => {
  assert.equal(zonedMidnightUtc('2026-07-01', TZ), '2026-07-01T05:00:00.000Z')
  assert.equal(zonedMidnightUtc('2026-12-01', TZ), '2026-12-01T06:00:00.000Z')
  assert.equal(zonedMidnightUtc('2026-11-01', TZ), '2026-11-01T05:00:00.000Z')
})

test('wallClockDate converts stored UTC into project local time', () => {
  assert.equal(wallClockDate('2026-10-28T03:30:00Z', TZ).toISOString(), '2026-10-27T22:30:00.000Z')
})

test('safeCellText neutralises formula prefixes and bounds length', () => {
  assert.equal(safeCellText('=HYPERLINK("x")'), `'=HYPERLINK("x")`)
  assert.equal(safeCellText('+1'), `'+1`)
  assert.equal(safeCellText('-cmd'), `'-cmd`)
  assert.equal(safeCellText('@SUM(A1)'), `'@SUM(A1)`)
  assert.equal(safeCellText('Framing'), 'Framing')
  assert.ok(safeCellText('a'.repeat(40_000)).length < 32_100)
})

test('buildExportFilename uses project metadata and strips unsafe characters', () => {
  assert.equal(buildExportFilename({ project_number: 'BJ-1002', name: 'Yaupon Dr' }, '2026-10-28'), 'BJ-1002_Yaupon-Dr_Activity-History_2026-10-28.xlsx')
  assert.equal(
    buildExportFilename({ project_number: null, name: '../Café "Rm" /x' }, '2026-10-28'),
    'Project_Cafe-Rm-x_Activity-History_2026-10-28.xlsx',
  )
})

test('presentEvent never fabricates values for text fields or missing actors', () => {
  const row: HistoryEventRow = {
    id: 'e1',
    activity_name: 'Framing',
    event_type: 'updated',
    actor_id: null,
    changes: { internal_notes: { from: 'secret', to: 'new secret' }, status: { from: 'not_started', to: 'in_progress' } },
    created_at: '2026-10-28T15:00:00Z',
  }
  const p = presentEvent(row, nameFor, TZ)
  assert.equal(p.actorName, 'System')
  const notes = p.changes.find((c) => c.field === 'internal_notes')
  assert.equal(notes?.from, '')
  assert.equal(notes?.to, '')
  assert.ok(!p.action.includes('secret'))
  assert.match(p.action, /Status: Not started → In progress/)
  assert.equal(presentEvent({ ...row, actor_id: 'gone' }, nameFor, TZ).actorName, 'Former team member')
})
