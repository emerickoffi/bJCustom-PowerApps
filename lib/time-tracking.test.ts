import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  csvCell, decimalHours, formatMinutes, parseManualEntry, timeEntriesCsv, totalsBy, utcToZoned, weekStart, zonedDayRange, zonedToUtc,
} from './time-tracking.ts'

const CHI = 'America/Chicago'

describe('time tracking helpers', () => {
  it('formats durations', () => {
    assert.equal(formatMinutes(450), '7h 30m')
    assert.equal(formatMinutes(60), '1h')
    assert.equal(formatMinutes(5), '0h 05m')
    assert.equal(decimalHours(450), '7.50')
  })

  it('converts company wall time to UTC across daylight saving', () => {
    assert.equal(zonedToUtc('2026-01-15', '07:00', CHI)?.toISOString(), '2026-01-15T13:00:00.000Z')
    assert.equal(zonedToUtc('2026-07-15', '07:00', CHI)?.toISOString(), '2026-07-15T12:00:00.000Z')
    assert.deepEqual(utcToZoned('2026-07-15T12:00:00.000Z', CHI), { date: '2026-07-15', time: '07:00' })
    assert.equal(zonedToUtc('2026-02-30', '07:00', CHI), null)
  })

  it('starts weeks on Monday', () => {
    assert.equal(weekStart('2026-11-19'), '2026-11-16')
    assert.equal(weekStart('2026-11-16'), '2026-11-16')
    assert.equal(weekStart('2026-11-22'), '2026-11-16')
  })

  it('gives whole-day UTC bounds in the zone', () => {
    assert.deepEqual(zonedDayRange('2026-11-16', '2026-11-22', CHI), { start: '2026-11-16T06:00:00.000Z', end: '2026-11-23T06:00:00.000Z' })
  })

  it('parses manual entries, including night shifts', () => {
    const day = parseManualEntry({ date: '2026-11-18', start: '07:00', end: '15:30', breakMinutes: '30' }, CHI)
    assert.deepEqual(day, { ok: true, startedAt: '2026-11-18T13:00:00.000Z', endedAt: '2026-11-18T21:30:00.000Z', breakMinutes: 30 })
    const night = parseManualEntry({ date: '2026-11-18', start: '22:00', end: '06:00', breakMinutes: 0 }, CHI)
    assert.equal(night.ok && night.endedAt, '2026-11-19T12:00:00.000Z')
    assert.equal(parseManualEntry({ date: '2026-11-18', start: '07:00', end: '08:00', breakMinutes: 90 }, CHI).ok, false)
    assert.equal(parseManualEntry({ date: 'x', start: '07:00', end: '08:00', breakMinutes: 0 }, CHI).ok, false)
  })

  it('totals by key', () => {
    const t = totalsBy([{ worked_minutes: 60, cost_cents: 100 }, { worked_minutes: 30, cost_cents: null }], () => 'a')
    assert.deepEqual(t.get('a'), { minutes: 90, costCents: 100, entries: 2 })
  })

  it('builds a safe CSV', () => {
    assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)")
    assert.equal(csvCell('a,b'), '"a,b"')
    const csv = timeEntriesCsv(
      [{ person: 'Ana', project: 'Maple', costCode: 'Framing', entry: { started_at: '2026-11-18T13:00:00.000Z', ended_at: '2026-11-18T21:30:00.000Z', break_minutes: 30, worked_minutes: 480, status: 'approved', hourly_cost_cents: 4500, cost_cents: 36000, notes: null } }],
      CHI,
    )
    assert.equal(csv.split('\r\n')[1], '2026-11-18,Ana,Maple,Framing,07:00,15:30,30,8.00,Approved,45.00,360.00,')
  })
})
