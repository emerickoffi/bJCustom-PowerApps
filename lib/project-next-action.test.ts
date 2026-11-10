import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildNextAction, type NextActionProject } from './project-next-action.ts'
import type { DashboardCardDetails } from './dashboard-cards.ts'

const details = (over: Partial<DashboardCardDetails> = {}) =>
  ({
    loadError: false,
    holdReason: null,
    scheduleEnabled: true,
    hasSchedule: false,
    undatedOpenCount: 0,
    activityCount: 0,
    stageActivities: null,
    nextActivity: null,
    overdueActivity: null,
    estimate: null,
    openClaim: null,
    openClaimCount: 0,
    warranty: null,
    ...over,
  }) as unknown as DashboardCardDetails

const project = (status: NextActionProject['status'], warrantyEnabled = true): NextActionProject => ({
  id: 'p1',
  status,
  warrantyEnabled,
})

test('lead and consultation without an estimate show no pending action, not schedule setup', () => {
  for (const status of ['lead', 'consultation'] as const) {
    const a = buildNextAction(project(status), details())
    assert.equal(a.title, 'No pending action')
    assert.equal(a.kind, 'info')
    assert.equal(a.href, undefined)
  }
})

test('draft estimate links to the specific estimate', () => {
  const a = buildNextAction(
    project('estimating'),
    details({ estimate: { id: 'e9', number: 'EST-4', name: 'Kitchen', status: 'draft', expirationDate: null, expired: false } } as never),
  )
  assert.equal(a.kind, 'action')
  assert.equal(a.href, '/estimates/e9')
  assert.match(a.title, /EST-4/)
})

test('a submitted, unexpired estimate is informational', () => {
  const a = buildNextAction(
    project('awaiting_approval'),
    details({ estimate: { id: 'e1', number: null, name: 'Bath', status: 'sent', expirationDate: '2026-12-01', expired: false } } as never),
  )
  assert.equal(a.kind, 'info')
  assert.equal(a.tone, 'muted')
})

test('overdue activity takes priority and links to that activity', () => {
  const a = buildNextAction(
    project('under_construction'),
    details({ hasSchedule: true, overdueActivity: { id: 'act 7', name: 'Framing', dueOn: '2026-10-01' } } as never),
  )
  assert.equal(a.tone, 'danger')
  assert.equal(a.href, '/projects/p1/schedule?activity=act%207')
})

test('construction stage without a schedule links to schedule setup', () => {
  const a = buildNextAction(project('under_construction'), details())
  assert.equal(a.title, 'Set up schedule')
  assert.equal(a.href, '/projects/p1/schedule')
})

test('open activities with no planned dates ask for schedule dates as a planning step', () => {
  const a = buildNextAction(project('under_construction'), details({ hasSchedule: true, activityCount: 5, undatedOpenCount: 3 }))
  assert.equal(a.title, 'Schedule dates needed')
  assert.equal(a.kind, 'action')
  assert.equal(a.tone, 'neutral')
  assert.equal(a.href, '/projects/p1/schedule')
  assert.match(a.meta ?? '', /^3 open activities/)
  const early = buildNextAction(project('planning'), details({ hasSchedule: true, activityCount: 1, undatedOpenCount: 1 }))
  assert.equal(early.title, 'Schedule dates needed')
  assert.match(early.meta ?? '', /^1 open activity /)
})

test('schedule dates never outrank overdue work, an estimate, a hold, or a closed project', () => {
  const undated = { hasSchedule: true, activityCount: 2, undatedOpenCount: 2 }
  const overdue = buildNextAction(
    project('under_construction'),
    details({ ...undated, overdueActivity: { id: 'a1', name: 'Framing', dueOn: null } } as never),
  )
  assert.match(overdue.title, /^Overdue/)
  const estimate = buildNextAction(
    project('estimating'),
    details({ ...undated, estimate: { id: 'e1', number: 'EST-1', name: 'Kitchen', status: 'draft', expirationDate: null, expired: false } } as never),
  )
  assert.match(estimate.title, /^Finish estimate/)
  assert.equal(buildNextAction(project('on_hold'), details(undated)).title, 'On hold')
  assert.equal(buildNextAction(project('cancelled'), details(undated)).title, 'Project cancelled')
  assert.equal(buildNextAction(project('completed', false), details(undated)).title, 'Project completed')
})

test('schedule dates are not asked of viewers who cannot plan, or when scheduling is off or could not load', () => {
  const undated = {
    hasSchedule: true,
    activityCount: 2,
    undatedOpenCount: 2,
    nextActivity: { id: 'a1', name: 'Framing', dueOn: null, overdue: false },
  }
  const restricted = buildNextAction({ ...project('under_construction'), canPlanSchedule: false }, details(undated))
  assert.equal(restricted.title, 'Next: Framing')
  assert.equal(restricted.meta, 'No due date set')
  const off = buildNextAction(project('under_construction'), details({ ...undated, scheduleEnabled: false }))
  assert.equal(off.title, 'No pending action')
  const failed = buildNextAction(project('under_construction'), details({ ...undated, loadError: true }))
  assert.equal(failed.kind, 'unavailable')
})

test('a partly dated schedule keeps its next activity', () => {
  const a = buildNextAction(
    project('under_construction'),
    details({ hasSchedule: true, activityCount: 3, nextActivity: { id: 'a2', name: 'Roofing', dueOn: '2026-12-01', overdue: false } }),
  )
  assert.equal(a.title, 'Next: Roofing')
})

test('monitoring warranty is coverage info, not a task', () => {
  const a = buildNextAction(
    project('completed'),
    details({ warranty: { stage: 'monitoring', milestoneLabel: 'Year 1 Monitoring', startDate: '2026-01-10' } } as never),
  )
  assert.equal(a.title, 'Warranty coverage active')
  assert.equal(a.kind, 'info')
  assert.notEqual(a.tone, 'danger')
})

test('an open builder-owned claim links to that claim', () => {
  const a = buildNextAction(
    project('completed'),
    details({
      openClaim: { id: 'c3', title: 'Leaking faucet', status: 'submitted', builderOwned: true },
      openClaimCount: 2,
    } as never),
  )
  assert.equal(a.kind, 'action')
  assert.equal(a.href, '/projects/p1/warranty#claim-c3')
  assert.match(a.meta ?? '', /1 more open/)
})

test('load errors are distinct from no pending action', () => {
  const a = buildNextAction(project('under_construction'), details({ loadError: true }))
  assert.equal(a.kind, 'unavailable')
  assert.equal(a.title, 'Next action unavailable')
})
