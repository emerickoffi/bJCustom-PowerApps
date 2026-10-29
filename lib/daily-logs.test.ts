import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  canEditDailyLog,
  crewTotals,
  dailyLogFilterQuery,
  dailyLogPdfBaseName,
  dailyLogPhotoPath,
  isDailyLogPhotoPath,
  isIsoDate,
  parseDailyLogFilters,
  parseDailyLogForm,
  todayInTimeZone,
} from './daily-logs.ts'

const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'

function form(entries: [string, string][]) {
  const fd = new FormData()
  for (const [k, v] of entries) fd.append(k, v)
  return fd
}

const base: [string, string][] = [
  ['log_date', '2026-10-28'],
  ['work_performed', 'Set trusses on the east wing'],
]

test('parses a minimal draft and drops blank crew rows', () => {
  const r = parseDailyLogForm(
    form([...base, ['crew_trade', 'Framing'], ['crew_size', '4'], ['crew_hours', '32.5'], ['crew_notes', ''], ['crew_trade', ''], ['crew_size', ''], ['crew_hours', ''], ['crew_notes', '']]),
    { today: '2026-10-29', allowedActivityIds: new Set() },
  )
  assert.ok(r.ok)
  assert.equal(r.header.work_performed, 'Set trusses on the east wing')
  assert.equal(r.header.weather_conditions, null)
  assert.deepEqual(r.crews, [{ trade: 'Framing', crew_size: 4, hours_worked: 32.5, notes: null, subcontractor_company_id: null }])
})

test('links a crew row to an allowed subcontractor company', () => {
  const r = parseDailyLogForm(
    form([...base, ['crew_company', A1], ['crew_trade', 'Electrical'], ['crew_size', '3'], ['crew_hours', ''], ['crew_notes', '']]),
    { today: '2026-10-29', allowedActivityIds: new Set(), allowedCompanyIds: new Set([A1]) },
  )
  assert.ok(r.ok)
  assert.equal(r.crews[0].subcontractor_company_id, A1)
})

test('rejects a crew company outside the allowed set or malformed', () => {
  const foreign = parseDailyLogForm(
    form([...base, ['crew_company', A2], ['crew_trade', 'Roofing'], ['crew_size', ''], ['crew_hours', ''], ['crew_notes', '']]),
    { today: '2026-10-29', allowedActivityIds: new Set(), allowedCompanyIds: new Set([A1]) },
  )
  assert.equal(foreign.ok, false)
  const malformed = parseDailyLogForm(
    form([...base, ['crew_company', 'not-a-uuid'], ['crew_trade', 'Roofing'], ['crew_size', ''], ['crew_hours', ''], ['crew_notes', '']]),
    { today: '2026-10-29', allowedActivityIds: new Set() },
  )
  assert.equal(malformed.ok, false)
})

test('rejects future dates, bad crew rows and foreign activities', () => {
  const r = parseDailyLogForm(
    form([['log_date', '2026-11-05'], ['crew_trade', ''], ['crew_size', '3'], ['crew_hours', ''], ['crew_notes', ''], ['activity_ids', A2]]),
    { today: '2026-10-29', allowedActivityIds: new Set([A1]) },
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.fieldErrors.log_date, /future/)
  assert.match(r.fieldErrors.crews, /Crew row 1/)
  assert.match(r.fieldErrors.activity_ids, /no longer/)
})

test('requires a delay description when reason or impact is given', () => {
  const r = parseDailyLogForm(form([...base, ['delay_reason', 'Rain']]), { today: '2026-10-29', allowedActivityIds: new Set() })
  assert.equal(r.ok, false)
  if (!r.ok) assert.ok(r.fieldErrors.delay_description)
})

test('validates temperature and hour precision', () => {
  const r = parseDailyLogForm(
    form([...base, ['temperature_f', '72.5'], ['crew_trade', 'Electric'], ['crew_size', '2'], ['crew_hours', '1.234'], ['crew_notes', '']]),
    { today: '2026-10-29', allowedActivityIds: new Set() },
  )
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.fieldErrors.temperature_f)
  assert.match(r.fieldErrors.crews, /decimals/)
})

test('deduplicates linked activities', () => {
  const r = parseDailyLogForm(form([...base, ['activity_ids', A1], ['activity_ids', A1]]), { today: '2026-10-29', allowedActivityIds: new Set([A1]) })
  assert.ok(r.ok)
  assert.deepEqual(r.activityIds, [A1])
})

test('dates', () => {
  assert.equal(isIsoDate('2026-02-30'), false)
  assert.equal(isIsoDate('2026-02-28'), true)
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  // 03:00 UTC on Oct 30 is still Oct 29 in Chicago.
  assert.equal(todayInTimeZone('America/Chicago', new Date('2026-10-30T03:00:00Z')), '2026-10-29')
  assert.equal(todayInTimeZone('Not/AZone', new Date('2026-10-30T03:00:00Z')), '2026-10-30')
})

test('PDF filename follows ProjectNumber_ProjectName_Daily-Log_Date', () => {
  assert.equal(dailyLogPdfBaseName({ projectNumber: 'BJ-1002', projectName: 'Yaupon Dr', logDate: '2026-10-28' }), 'BJ-1002_Yaupon-Dr_Daily-Log_2026-10-28')
  assert.equal(dailyLogPdfBaseName({ projectNumber: null, projectName: 'A/B & C', logDate: '2026-10-28' }), 'A-B-and-C_Daily-Log_2026-10-28')
})

test('photo paths stay inside the log folder', () => {
  const path = dailyLogPhotoPath(A1, 'x.jpg')
  assert.ok(isDailyLogPhotoPath(A1, path))
  assert.equal(isDailyLogPhotoPath(A2, path), false)
  assert.equal(isDailyLogPhotoPath(A1, `daily-logs/${A1}/../x.jpg`), false)
  assert.equal(isDailyLogPhotoPath(A1, `daily-logs/${A1}/a/b.jpg`), false)
})

test('filters normalize ranges and round-trip to a query', () => {
  const f = parseDailyLogFilters({ from: '2026-10-20', to: '2026-10-01', status: 'finalized', delays: '1', page: '3' })
  assert.deepEqual(f, { from: '2026-10-01', to: '2026-10-20', status: 'finalized', delays: true, page: 3 })
  assert.equal(dailyLogFilterQuery(f, { page: 1 }), '?from=2026-10-01&to=2026-10-20&status=finalized&delays=1')
  assert.deepEqual(parseDailyLogFilters({ status: 'nope', page: '-1', from: 'x' }), { from: null, to: null, status: null, delays: false, page: 1 })
})

test('crew totals and editability', () => {
  assert.deepEqual(crewTotals([{ crew_size: 3, hours_worked: 24 }, { crew_size: null, hours_worked: 2.5 }]), { workers: 3, hours: 26.5 })
  assert.equal(canEditDailyLog('draft', false), true)
  assert.equal(canEditDailyLog('finalized', false), false)
  assert.equal(canEditDailyLog('draft', true), false)
})
