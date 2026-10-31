import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimProgress, coverageProgress, coverageState, csvEscape, nextClaimAction } from './warranty-coverage.ts'

const TODAY = '2026-10-31'

test('coverage periods are evaluated independently against their own due dates (concurrent 1-2-10)', () => {
  const start = '2026-03-01'
  const y1 = coverageState({ due_on: '2027-03-01', reached_at: null }, TODAY)
  const y2 = coverageState({ due_on: '2028-03-01', reached_at: null }, TODAY)
  const y10 = coverageState({ due_on: '2036-03-01', reached_at: null }, TODAY)
  assert.equal(y1.state, 'active')
  assert.equal(y2.state, 'active')
  assert.equal(y10.state, 'active')
  assert.ok(coverageProgress(start, '2027-03-01', TODAY) > coverageProgress(start, '2028-03-01', TODAY))
})

test('expiring soon inside the 30 day window, expired after due date even before the job runs', () => {
  assert.equal(coverageState({ due_on: '2026-11-20', reached_at: null }, TODAY).state, 'expiring_soon')
  assert.equal(coverageState({ due_on: '2026-11-20', reached_at: null }, TODAY).daysRemaining, 20)
  assert.equal(coverageState({ due_on: '2026-10-30', reached_at: null }, TODAY).state, 'expired')
  assert.equal(coverageState({ due_on: '2027-10-30', reached_at: '2026-10-01T00:00:00Z' }, TODAY).state, 'expired')
  assert.equal(coverageState({ due_on: TODAY, reached_at: null }, TODAY).state, 'expiring_soon')
})

test('missing records are not applicable, malformed dates are unavailable', () => {
  assert.equal(coverageState(null, TODAY).state, 'not_applicable')
  assert.equal(coverageState({ due_on: null, reached_at: null }, TODAY).state, 'unavailable')
})

test('claim progress maps canonical statuses without fabricating completed steps', () => {
  const p = claimProgress({ status: 'submitted', coverage_decision: null, homeowner_validation: 'pending' })
  assert.deepEqual(p.steps.map((s) => s.state), ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])

  const info = claimProgress({ status: 'info_requested', coverage_decision: null, homeowner_validation: 'pending' })
  assert.equal(info.steps[1].state, 'attention')
  assert.equal(info.outcome, 'info_required')

  const awaiting = claimProgress({ status: 'ready_for_validation', coverage_decision: 'covered', homeowner_validation: 'pending' })
  assert.equal(awaiting.steps[5].state, 'current')
  assert.equal(awaiting.steps[4].state, 'complete')
})

test('not-covered claims skip repair steps and keep a distinct outcome', () => {
  const denied = claimProgress({ status: 'not_covered', coverage_decision: 'not_covered', homeowner_validation: 'pending' })
  assert.equal(denied.outcome, 'not_covered')
  assert.deepEqual(denied.steps.slice(2, 6).map((s) => s.state), ['skipped', 'skipped', 'skipped', 'skipped'])
  const closed = claimProgress({ status: 'closed', coverage_decision: 'not_covered', homeowner_validation: 'pending' })
  assert.equal(closed.outcome, 'not_covered')
  assert.equal(closed.steps[3].state, 'skipped')
})

test('rejected repairs show as reopened while history is kept', () => {
  const r = claimProgress({
    status: 'in_progress',
    coverage_decision: 'covered',
    homeowner_validation: 'rejected',
    eventTypes: ['submitted', 'accept', 'ready_for_validation', 'reject_repair'],
  })
  assert.equal(r.outcome, 'reopened')
  assert.equal(r.steps[3].state, 'attention')
})

test('next action reflects audience', () => {
  assert.equal(nextClaimAction('ready_for_validation', 'pending', 'homeowner'), 'Confirm whether the repair is resolved')
  assert.equal(nextClaimAction('ready_for_validation', 'accepted', 'staff'), 'Close the claim')
})

test('csv escaping neutralizes formulas and quotes', () => {
  assert.equal(csvEscape('=SUM(A1)'), "'=SUM(A1)")
  assert.equal(csvEscape('a,"b"'), '"a,""b"""')
  assert.equal(csvEscape(null), '')
})
