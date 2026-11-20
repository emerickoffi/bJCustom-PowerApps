import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildScheduleReport, isLate, parseLookahead, weekStart, type ReportActivity } from './schedule-report.ts'
import { buildWarrantyReport, type ReportClaim } from './warranty-report.ts'
import { scheduleReportCsv } from './data-exports.ts'
import { FEATURES, isSwitchable } from './feature-registry.ts'

// 2026-11-18 is a Wednesday.
const TODAY = '2026-11-18'
let n = 0
function act(over: Partial<ReportActivity>): ReportActivity {
  n += 1
  return {
    id: `a${n}`,
    project_id: 'p1',
    project_name: 'Lee Residence',
    name: `Activity ${n}`,
    phase: 'Framing',
    activity_type: 'task',
    status: 'not_started',
    planned_start: null,
    planned_end: null,
    percent_complete: 0,
    delay_reason: null,
    who: [],
    ...over,
  }
}

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-11-18'), '2026-11-16')
  assert.equal(weekStart('2026-11-16'), '2026-11-16')
  assert.equal(weekStart('2026-11-22'), '2026-11-16')
})

test('late means delayed, or past planned finish and not done', () => {
  assert.equal(isLate({ status: 'in_progress', planned_end: '2026-11-17' }, TODAY), true)
  assert.equal(isLate({ status: 'delayed', planned_end: '2026-12-01' }, TODAY), true)
  assert.equal(isLate({ status: 'completed', planned_end: '2026-11-01' }, TODAY), false)
  assert.equal(isLate({ status: 'not_started', planned_end: TODAY }, TODAY), false)
})

test('behind schedule is sorted by days late and coming up is grouped by week', () => {
  const r = buildScheduleReport(
    [
      act({ name: 'Drywall', status: 'in_progress', planned_start: '2026-11-01', planned_end: '2026-11-10' }),
      act({ name: 'Roof', status: 'in_progress', planned_start: '2026-11-01', planned_end: '2026-11-16' }),
      act({ name: 'Permit', status: 'delayed', planned_start: '2026-11-20', planned_end: '2026-11-25' }),
      act({ name: 'Paint', planned_start: '2026-11-19', planned_end: '2026-11-21' }),
      act({ name: 'Trim', planned_start: '2026-11-24', planned_end: '2026-11-26' }),
      act({ name: 'Plumbing', status: 'in_progress', planned_start: '2026-11-10', planned_end: '2026-11-20' }),
      act({ name: 'Far off', planned_start: '2026-12-15' }),
      act({ name: 'Undated' }),
      act({ name: 'Done', status: 'completed', planned_start: '2026-11-19' }),
    ],
    TODAY,
    2,
  )
  assert.deepEqual(r.late.map((a) => [a.name, a.daysLate]), [['Drywall', 8], ['Roof', 2], ['Permit', null]])
  assert.deepEqual(r.weeks.map((w) => w.label), ['This week', 'Next week'])
  assert.deepEqual(r.weeks[0].items.map((a) => a.name), ['Plumbing', 'Paint'])
  assert.deepEqual(r.weeks[1].items.map((a) => a.name), ['Trim'])
})

test('look-ahead accepts only 2, 3 or 4 weeks', () => {
  assert.equal(parseLookahead('3'), 3)
  assert.equal(parseLookahead('9'), 2)
  assert.equal(parseLookahead(undefined), 2)
  const r = buildScheduleReport([act({ name: 'Later', planned_start: '2026-12-01' })], TODAY, 3)
  assert.equal(r.weeks[0].label, 'Week of Nov 30')
})

test('schedule CSV lists both sections', () => {
  const r = buildScheduleReport([act({ name: 'Late one', status: 'delayed', who: ['Ace Framing'] }), act({ name: 'Soon', planned_start: '2026-11-19' })], TODAY, 2)
  const lines = scheduleReportCsv(r).trim().split('\r\n')
  assert.equal(lines.length, 3)
  assert.ok(lines[1].startsWith('Behind schedule,Lee Residence,Late one'))
  assert.ok(lines[1].includes('Ace Framing'))
  assert.ok(lines[2].startsWith('This week,'))
})

const claim = (over: Partial<ReportClaim>): ReportClaim => ({
  id: Math.random().toString(36),
  project_id: 'p1',
  project_name: 'Lee Residence',
  title: 'Cracked tile',
  category: 'Flooring',
  location: 'Kitchen',
  status: 'submitted',
  reported_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
  assignee: null,
  ...over,
})

test('warranty claims split by who acts next, and stalled builder claims are flagged', () => {
  const r = buildWarrantyReport({
    today: TODAY,
    homes: 4,
    claims: [
      claim({ title: 'Fresh', updated_at: '2026-11-17T00:00:00Z' }),
      claim({ title: 'Stalled', status: 'in_progress', updated_at: '2026-10-20T00:00:00Z' }),
      claim({ title: 'Asked homeowner', status: 'info_requested', updated_at: '2026-10-01T00:00:00Z' }),
      claim({ title: 'Closed', status: 'closed' }),
    ],
    coverage: [
      { project_id: 'p1', project_name: 'Lee', coverage_name: '1-year workmanship', due_on: '2026-12-01' },
      { project_id: 'p2', project_name: 'Ortiz', coverage_name: '2-year systems', due_on: '2027-06-01' },
    ],
    followups: [
      { id: 'f1', project_id: 'p1', project_name: 'Lee', coverage_name: '1-year', due_on: '2026-11-10', status: 'todo' },
      { id: 'f2', project_id: 'p2', project_name: 'Ortiz', coverage_name: '1-year', due_on: '2027-03-01', status: 'todo' },
      { id: 'f3', project_id: 'p3', project_name: 'Park', coverage_name: '1-year', due_on: '2026-11-20', status: 'sent' },
    ],
  })
  assert.deepEqual(r.needsAction.map((c) => [c.title, c.pastTarget]), [['Stalled', true], ['Fresh', false]])
  assert.deepEqual(r.waitingOnHomeowner.map((c) => [c.title, c.pastTarget]), [['Asked homeowner', false]])
  assert.deepEqual(r.coverageEnding.map((m) => [m.coverage_name, m.daysLeft]), [['1-year workmanship', 13]])
  assert.deepEqual(r.followups.map((f) => [f.id, f.daysUntil]), [['f1', -8]])
})

test('both reports can be switched on and off', () => {
  for (const key of ['schedule_reports', 'warranty_reports']) {
    assert.equal(isSwitchable(FEATURES.find((f) => f.key === key)!), true, key)
  }
})
