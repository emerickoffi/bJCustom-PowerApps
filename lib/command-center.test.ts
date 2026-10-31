import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildComingUp } from './coming-up.ts'
import { rankPriorityJobs, summarizeJob, type JobSummaryInput } from './priority-jobs.ts'
import type { AgendaEntry } from './agenda.ts'

const today = '2026-10-31'
const entry = (over: Partial<AgendaEntry>): AgendaEntry => ({
  id: 'a1',
  project_id: 'p1',
  projectName: 'Oak',
  name: 'Framing',
  activity_type: 'task',
  status: 'not_started',
  planned_start: '2026-11-02',
  planned_end: '2026-11-05',
  date: '2026-11-02',
  kind: 'starts',
  ...over,
})

test('coming up skips ongoing work, out-of-window dates, and proposed starts on active projects', () => {
  const events = buildComingUp({
    today,
    days: 14,
    agenda: [entry({}), entry({ id: 'a2', kind: 'ongoing', date: today }), entry({ id: 'a3', date: '2026-12-30' })],
    proposedStarts: [
      { id: 'p2', name: 'Elm', status: 'preconstruction', proposed_start_date: '2026-11-03' },
      { id: 'p3', name: 'Pine', status: 'under_construction', proposed_start_date: '2026-11-03' },
    ],
    warranties: [{ projectId: 'p4', projectName: 'Ash', coverageName: 'Workmanship', milestoneLabel: 'Year 1', milestoneDueOn: '2026-11-10' }],
  })
  assert.deepEqual(
    events.map((e) => [e.kind, e.projectName]),
    [
      ['schedule', 'Oak'],
      ['proposed_start', 'Elm'],
      ['warranty', 'Ash'],
    ],
  )
  assert.match(events[1].description, /not a confirmed start/)
})

test('priority jobs put verified risk first and never promote missing data', () => {
  const rows = [
    { id: 'lead', status: 'lead' as const, updated_at: '2026-10-30' },
    { id: 'ok', status: 'under_construction' as const, updated_at: '2026-10-29' },
    { id: 'risk', status: 'under_construction' as const, updated_at: '2026-01-01' },
    { id: 'nodata', status: 'preconstruction' as const, updated_at: '2026-10-28' },
  ]
  const health = new Map([
    ['ok', { level: 'on_track' as const, reasons: [] }],
    ['risk', { level: 'at_risk' as const, reasons: ['3 overdue activities'] }],
    ['nodata', { level: 'insufficient_data' as const, reasons: [] }],
  ])
  const ranked = rankPriorityJobs(rows, { attention: new Set(), upcoming: new Map() }, health, 6)
  assert.equal(ranked[0], 'risk')
  assert.ok(ranked.indexOf('nodata') > ranked.indexOf('risk'))
})

const base: JobSummaryInput = {
  status: 'lead',
  progressPercent: 40,
  hasSchedule: false,
  nextActivity: null,
  holdReason: null,
  warranty: null,
  warrantyEnabled: true,
  health: null,
}

test('lead and consultation jobs never show construction progress', () => {
  assert.equal(summarizeJob(base).progress, null)
  assert.equal(summarizeJob({ ...base, status: 'consultation' }).progress, null)
})

test('construction progress requires a real schedule', () => {
  assert.equal(summarizeJob({ ...base, status: 'under_construction' }).progress, null)
  assert.equal(summarizeJob({ ...base, status: 'under_construction', hasSchedule: true }).progress, 40)
})

test('completed homes show the next warranty milestone', () => {
  const s = summarizeJob({ ...base, status: 'completed', warranty: { milestoneLabel: 'Year 2 review', milestoneDueOn: '2027-05-01' } })
  assert.equal(s.text, 'Year 2 review')
  assert.equal(s.dueOn, '2027-05-01')
})
