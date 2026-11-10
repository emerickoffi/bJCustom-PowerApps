import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PREVIEW_QUESTION_LIMIT,
  PREVIEW_SUMMARY_MAX,
  activityAssignees,
  assignmentDirectoryErrorState,
  buildSubcontractorEntries,
  dailyLogSummary,
  filterSubcontractors,
  isPastPlannedFinish,
  pickHomeowners,
  pickNextActivity,
  pickPendingQuestions,
  plannedLabel,
  previewErrorState,
  subcontractorDetails,
  type HomeownerGroupInput,
  type PendingQuestionRow,
  type PreviewActivityRow,
} from './project-preview.ts'
import { undatedOpenActivityCount } from './schedule.ts'

const activity = (over: Partial<PreviewActivityRow> = {}): PreviewActivityRow => ({
  id: 'a1',
  name: 'Framing',
  status: 'not_started',
  planned_start: null,
  planned_end: null,
  activity_type: 'task',
  assigned_to: null,
  ...over,
})

test('next activity is the earliest dated open activity', () => {
  const picked = pickNextActivity([
    activity({ id: 'done', status: 'completed', planned_start: '2026-01-01' }),
    activity({ id: 'skipped', status: 'skipped', planned_start: '2026-01-02' }),
    activity({ id: 'later', planned_start: '2026-03-10' }),
    activity({ id: 'sooner', planned_end: '2026-02-01' }),
    activity({ id: 'undated' }),
  ])
  assert.equal(picked.state, 'ready')
  assert.equal(picked.state === 'ready' && picked.activity.id, 'sooner')
})

test('next activity reports why nothing is next', () => {
  assert.equal(pickNextActivity([]).state, 'empty')
  assert.equal(pickNextActivity([activity({ status: 'skipped' })]).state, 'empty')
  assert.equal(pickNextActivity([activity({ status: 'completed' })]).state, 'complete')
  assert.equal(pickNextActivity([activity({ status: 'completed' }), activity()]).state, 'undated')
})

test('an undated schedule names the first open activity in schedule order', () => {
  const picked = pickNextActivity([
    activity({ id: 'done', name: 'Permits', status: 'completed' }),
    activity({ id: 'first', name: 'Foundation' }),
    activity({ id: 'second', name: 'Framing' }),
  ])
  assert.equal(picked.state === 'undated' && picked.first.name, 'Foundation')
})

test('schedule dates are needed exactly when the next activity is undated', () => {
  const cases: PreviewActivityRow[][] = [
    [],
    [activity({ status: 'skipped' })],
    [activity({ status: 'completed', planned_end: '2026-01-01' })],
    [activity({ status: 'completed', planned_end: '2026-01-01' }), activity(), activity({ status: 'in_progress' })],
    [activity(), activity({ planned_start: '2026-03-01' })],
    [activity(), activity({ status: 'delayed', planned_end: '2026-03-01' })],
    [activity({ status: 'skipped', planned_end: '2026-03-01' }), activity({ status: 'on_hold' })],
  ]
  assert.deepEqual(cases.map(undatedOpenActivityCount), [0, 0, 0, 2, 0, 0, 1])
  for (const rows of cases) {
    assert.equal(pickNextActivity(rows).state === 'undated', undatedOpenActivityCount(rows) > 0)
  }
})

test('past planned finish ignores finished work', () => {
  assert.equal(isPastPlannedFinish(activity({ planned_end: '2026-05-01' }), '2026-06-01'), true)
  assert.equal(isPastPlannedFinish(activity({ planned_end: '2026-06-01' }), '2026-06-01'), false)
  assert.equal(isPastPlannedFinish(activity({ status: 'completed', planned_end: '2026-05-01' }), '2026-06-01'), false)
})

test('planned label covers ranges, single days, and start-only dates', () => {
  assert.match(plannedLabel({ planned_start: '2026-03-02', planned_end: '2026-03-06' }), / – /)
  assert.match(plannedLabel({ planned_start: '2026-03-06', planned_end: '2026-03-06' }), /^Planned /)
  assert.match(plannedLabel({ planned_start: null, planned_end: '2026-03-06' }), /^Planned /)
  assert.match(plannedLabel({ planned_start: '2026-03-02', planned_end: null }), /^Starts /)
})

test('daily log summary uses the first written field on one line', () => {
  const empty = { work_performed: null, progress_notes: null, weather_conditions: null }
  assert.equal(dailyLogSummary(empty), null)
  assert.equal(dailyLogSummary({ ...empty, work_performed: '   ', weather_conditions: 'Clear' }), 'Clear')
  assert.equal(dailyLogSummary({ ...empty, work_performed: 'Poured\n\n  footings', progress_notes: 'On track' }), 'Poured footings')
})

test('daily log summary is capped', () => {
  const summary = dailyLogSummary({ work_performed: 'x'.repeat(PREVIEW_SUMMARY_MAX + 50), progress_notes: null, weather_conditions: null })
  assert.equal(summary?.length, PREVIEW_SUMMARY_MAX)
  assert.equal(summary?.endsWith('…'), true)
})

test('only unexpected failures are retryable', () => {
  assert.equal(previewErrorState(401).retry, false)
  assert.equal(previewErrorState(403).retry, false)
  assert.equal(previewErrorState(404).retry, false)
  assert.equal(previewErrorState(500).retry, true)
  assert.equal(previewErrorState(null).retry, true)
})

test('an activity names its person and companies once each', () => {
  assert.equal(activityAssignees(null, []), null)
  assert.equal(activityAssignees('Dana Ortiz', [null, undefined, '  ']), 'Dana Ortiz')
  assert.equal(activityAssignees('Dana Ortiz', ['Acme Framing', 'acme framing', 'Volt Electric']), 'Dana Ortiz · Acme Framing · Volt Electric')
  assert.equal(activityAssignees(null, ['Acme Framing']), 'Acme Framing')
})

const hrefs = { company: (id: string) => `/subcontractors/${id}`, person: (id: string) => `/contacts/people/${id}` }

test('assigned subcontractors are counted once each, companies before individuals', () => {
  const entries = buildSubcontractorEntries(
    [
      { subcontractor_company_id: 's2', company_name: 'Volt Electric', trade: 'Electrical' },
      { subcontractor_company_id: 's1', company_name: 'Acme Framing', trade: null },
      // The same assignment returned twice by a join.
      { subcontractor_company_id: 's2', company_name: 'Volt Electric', trade: 'Electrical' },
    ],
    [
      { person_id: 'p1', name: 'Sam Lee', project_role: 'Site lead', company_name: 'Volt Electric', trade: 'Electrical' },
      { person_id: 'p1', name: 'Sam Lee', project_role: 'Site lead', company_name: 'Volt Electric', trade: 'Electrical' },
      { person_id: 'p2', name: 'Ana Ruiz', project_role: null, company_name: null, trade: null },
    ],
    hrefs,
  )
  assert.deepEqual(
    entries.map((e) => e.key),
    ['company:s1', 'company:s2', 'person:p2', 'person:p1'],
  )
  assert.equal(entries.length, 4)
  assert.equal(entries[1].href, '/subcontractors/s2')
  assert.equal(entries[3].href, '/contacts/people/p1')
})

test('a company assignment never stands in for its people, and an individual on a company is not a company', () => {
  const entries = buildSubcontractorEntries(
    [{ subcontractor_company_id: 's1', company_name: 'Acme Framing', trade: 'Framing' }],
    [{ person_id: 'p1', name: 'Jo Park', project_role: 'Foreman', company_name: 'Acme Framing', trade: 'Framing' }],
    hrefs,
  )
  assert.deepEqual(
    entries.map((e) => [e.kind, e.name, e.company]),
    [
      ['company', 'Acme Framing', null],
      ['person', 'Jo Park', 'Acme Framing'],
    ],
  )
})

test('subcontractor details never repeat the entry name or each other', () => {
  const [company] = buildSubcontractorEntries([{ subcontractor_company_id: 's1', company_name: 'Acme Framing', trade: 'Framing' }], [], hrefs)
  assert.deepEqual(subcontractorDetails(company), ['Framing'])

  const [, soleTrader] = buildSubcontractorEntries(
    [],
    [
      { person_id: 'p1', name: 'Ana Ruiz', project_role: 'Electrician', company_name: 'Volt Electric', trade: 'Electrician' },
      { person_id: 'p2', name: 'Lee Tile', project_role: null, company_name: 'lee tile', trade: 'Tile' },
    ],
    hrefs,
  )
  assert.equal(soleTrader.company, null)
  assert.deepEqual(subcontractorDetails(soleTrader), ['Tile'])
  const [ana] = buildSubcontractorEntries(
    [],
    [{ person_id: 'p1', name: 'Ana Ruiz', project_role: 'Electrician', company_name: 'Volt Electric', trade: 'Electrician' }],
    hrefs,
  )
  assert.deepEqual(subcontractorDetails(ana), ['Electrician', 'Volt Electric'])
})

test('directory links are left out for viewers who cannot open the records', () => {
  const entries = buildSubcontractorEntries(
    [{ subcontractor_company_id: 's1', company_name: 'Acme Framing', trade: null }],
    [{ person_id: 'p1', name: 'Jo Park', project_role: null, company_name: null, trade: null }],
    { company: null, person: null },
  )
  assert.deepEqual(
    entries.map((e) => e.href),
    [null, null],
  )
})

test('assigned subcontractors can be searched by name, company, trade, role, or kind', () => {
  const entries = buildSubcontractorEntries(
    [{ subcontractor_company_id: 's1', company_name: 'Acme Framing', trade: 'Framing' }],
    [
      { person_id: 'p1', name: 'Jo Park', project_role: 'Foreman', company_name: 'Acme Framing', trade: 'Framing' },
      { person_id: 'p2', name: 'Ana Ruiz', project_role: 'Inspector', company_name: null, trade: null },
    ],
    hrefs,
  )
  const keys = (query: string) => filterSubcontractors(entries, query).map((e) => e.key)
  assert.deepEqual(keys('  '), ['company:s1', 'person:p2', 'person:p1'])
  assert.deepEqual(keys('ACME'), ['company:s1', 'person:p1'])
  assert.deepEqual(keys('inspector'), ['person:p2'])
  assert.deepEqual(keys('company'), ['company:s1'])
  assert.deepEqual(keys('plumbing'), [])
})

const group = (over: Partial<HomeownerGroupInput> = {}): HomeownerGroupInput => ({
  linkId: 'l1',
  linkRelationship: 'primary_owner',
  client: { name: 'Chris Lee', email: 'chris@example.com', phone: '555-0100' },
  contacts: [],
  ...over,
})

test('the primary homeowner comes first and the secondary contact is labeled', () => {
  const picked = pickHomeowners([
    group({ linkId: 'l2', linkRelationship: 'co_owner', client: { name: 'Robin Vale', email: null, phone: null } }),
    group({
      contacts: [
        { id: 'c2', name: 'Pat Lee', relationship: 'spouse', email: null, phone: '555-0101', isPrimary: false },
        { id: 'c1', name: 'Chris Lee', relationship: 'primary_owner', email: 'chris@example.com', phone: null, isPrimary: true },
      ],
    }),
  ])
  assert.deepEqual(picked.primary, { name: 'Chris Lee', detail: null, email: 'chris@example.com', phone: null })
  assert.deepEqual(picked.secondary, { name: 'Pat Lee', detail: 'Spouse', email: null, phone: '555-0101' })
  assert.equal(picked.otherCount, 1)
})

test('homeowners fall back to the client record and report when nobody is linked', () => {
  assert.deepEqual(pickHomeowners([]), { primary: null, secondary: null, otherCount: 0 })
  const picked = pickHomeowners([group(), group({ linkId: 'l2', linkRelationship: 'co_owner', client: { name: 'Robin Vale', email: null, phone: null } })])
  assert.equal(picked.primary?.name, 'Chris Lee')
  assert.deepEqual(picked.secondary, { name: 'Robin Vale', detail: 'Co-owner', email: null, phone: null })
  assert.equal(picked.otherCount, 0)
})

const question = (over: Partial<PendingQuestionRow> = {}): PendingQuestionRow => ({
  id: 'q1',
  rfi_number: 1,
  status: 'open',
  subject: 'Window header height',
  responder_name: 'Sam Lee',
  responder_company: null,
  due_date: null,
  updated_at: '2026-05-01T00:00:00Z',
  ...over,
})

test('pending questions put overdue first, then answers waiting for review, then the rest by due date', () => {
  const picked = pickPendingQuestions(
    [
      question({ id: 'no-due' }),
      question({ id: 'draft', status: 'draft', rfi_number: null }),
      question({ id: 'answered', status: 'answered', due_date: '2026-05-20' }),
      question({ id: 'closed', status: 'closed' }),
      question({ id: 'later', due_date: '2026-06-20' }),
      question({ id: 'overdue', due_date: '2026-05-30', responder_company: 'Volt Electric', rfi_number: 7 }),
    ],
    'project-1',
    '2026-06-01',
    10,
  )
  assert.deepEqual(
    picked.map((q) => q.id),
    ['overdue', 'answered', 'later', 'no-due'],
  )
  assert.equal(picked[0].overdue, true)
  assert.equal(picked[0].ref, 'RFI-007')
  assert.equal(picked[0].responsible, 'Sam Lee · Volt Electric')
  assert.match(picked[0].context, /^Overdue · was due /)
  assert.equal(picked[1].context, 'Answered · waiting for review')
  assert.equal(picked[1].overdue, false)
  assert.match(picked[2].context, /^Open · due /)
  assert.equal(picked[3].context, 'Open · no due date')
  assert.equal(picked[0].href, '/projects/project-1/rfis?rfi=overdue')
})

test('pending questions are capped for the preview', () => {
  const rows = Array.from({ length: 5 }, (_, i) => question({ id: `q${i}`, due_date: `2026-07-0${i + 1}` }))
  assert.equal(pickPendingQuestions(rows, 'project-1', '2026-06-01').length, PREVIEW_QUESTION_LIMIT)
})

test('a project that cannot take assignments explains why and is not retried', () => {
  assert.deepEqual(assignmentDirectoryErrorState(409, 'This project is completed.'), { message: 'This project is completed.', retry: false })
  assert.equal(assignmentDirectoryErrorState(409).retry, false)
  assert.equal(assignmentDirectoryErrorState(403).retry, false)
  assert.equal(assignmentDirectoryErrorState(401).retry, false)
  assert.equal(assignmentDirectoryErrorState(500).retry, true)
  assert.equal(assignmentDirectoryErrorState(null).retry, true)
})
