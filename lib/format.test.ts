import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDate, formatDateTime, formatPhone } from './format.ts'

test('US phone numbers render consistently; other formats are left as entered', () => {
  assert.equal(formatPhone('5555551234'), '(555) 555-1234')
  assert.equal(formatPhone('555.555.1234'), '(555) 555-1234')
  assert.equal(formatPhone('+1 555 555 1234'), '(555) 555-1234')
  assert.equal(formatPhone('+44 20 7946 0958'), '+44 20 7946 0958')
  assert.equal(formatPhone('555-1234 ext 9'), '555-1234 ext 9')
  assert.equal(formatPhone(null), '')
})

test('timestamps render in the organization zone, not the runtime zone', () => {
  // 11:06 UTC on Oct 29 2026 is 6:06 AM CDT — the observed "6:06 AM vs 1:06 AM" signing copy.
  assert.equal(formatDateTime('2026-10-29T11:06:00Z'), 'Oct 29, 2026, 6:06 AM CDT')
  assert.equal(formatDateTime('2026-10-29T11:06:00+00:00'), formatDateTime('2026-10-29T06:06:00-05:00'))
})

test('same instant formats identically regardless of process TZ', () => {
  const before = process.env.TZ
  const iso = '2026-10-29T11:14:27.123Z'
  process.env.TZ = 'UTC'
  const utc = formatDateTime(iso)
  process.env.TZ = 'Asia/Tokyo'
  const tokyo = formatDateTime(iso)
  process.env.TZ = before
  assert.equal(utc, tokyo)
  assert.equal(utc, 'Oct 29, 2026, 6:14 AM CDT')
})

test('daylight saving transitions use the correct offset', () => {
  // DST ends Nov 1 2026 at 2:00 AM CDT -> 1:00 AM CST.
  assert.equal(formatDateTime('2026-11-01T06:30:00Z'), 'Nov 1, 2026, 1:30 AM CDT')
  assert.equal(formatDateTime('2026-11-01T07:30:00Z'), 'Nov 1, 2026, 1:30 AM CST')
  // DST starts Mar 8 2026 at 2:00 AM CST -> 3:00 AM CDT.
  assert.equal(formatDateTime('2026-03-08T07:59:00Z'), 'Mar 8, 2026, 1:59 AM CST')
  assert.equal(formatDateTime('2026-03-08T08:00:00Z'), 'Mar 8, 2026, 3:00 AM CDT')
})

test('date-only values keep their calendar date', () => {
  assert.equal(formatDate('2026-11-01'), 'Nov 1, 2026')
  assert.equal(formatDate('2026-01-01'), 'Jan 1, 2026')
  assert.equal(formatDate('2026-12-31'), 'Dec 31, 2026')
})

test('timestamp dates use the organization calendar day', () => {
  // 03:00 UTC Oct 30 is still Oct 29 in Chicago.
  assert.equal(formatDate('2026-10-30T03:00:00Z'), 'Oct 29, 2026')
})

test('empty and invalid input render a dash instead of throwing', () => {
  assert.equal(formatDate(null), '—')
  assert.equal(formatDateTime(undefined), '—')
  assert.equal(formatDate('not a date'), '—')
  assert.equal(formatDateTime('not a date'), '—')
})

test('explicit zone override is honored', () => {
  assert.equal(formatDateTime('2026-10-29T11:06:00Z', 'UTC'), 'Oct 29, 2026, 11:06 AM UTC')
})
