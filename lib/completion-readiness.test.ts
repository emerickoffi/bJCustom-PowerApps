import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateCompletionReadiness,
  GATED_REQUIREMENT_KEYS,
  isSubstantiveJustification,
  type ReadinessFacts,
} from './completion-readiness.ts'

const ready: ReadinessFacts = {
  features: { schedule: true, walkthroughs: true, documents: true, e_signatures: true, invoices: true, warranty: true },
  scheduleActivityCount: 20,
  scheduleIncompleteCount: 0,
  inspectionCount: 3,
  inspectionsOutstandingCount: 0,
  openPunchItemCount: 0,
  finalWalkthroughSubmitted: true,
  latestFinalSignoff: 'verified',
  homeownerAcknowledged: true,
  homeownerCount: 1,
  pendingSignatureCount: 0,
  outstandingInvoiceCount: 0,
  pendingChangeOrderCount: 0,
}
const evaluate = (patch: Partial<ReadinessFacts>) => evaluateCompletionReadiness({ ...ready, ...patch }, 'p1')
const keys = (items: { key: string }[]) => items.map((i) => i.key).sort()

test('a fully closed-out project is ready with no blockers or warnings', () => {
  const s = evaluate({})
  assert.equal(s.overall, 'ready')
  assert.equal(s.blockers.length, 0)
  assert.equal(s.warnings.length, 0)
  assert.equal(s.satisfiedCount, s.applicableCount)
})

test('missing schedule is evidence-needed, never treated as complete', () => {
  const s = evaluate({ scheduleActivityCount: 0, scheduleIncompleteCount: 0 })
  const item = s.items.find((i) => i.key === 'schedule_recorded')
  assert.equal(item?.state, 'needs_evidence')
  assert.equal(s.overall, 'needs_exceptions')
})

test('outstanding inspections are a hard blocker that exceptions cannot waive', () => {
  const s = evaluate({ inspectionsOutstandingCount: 1 })
  assert.equal(s.overall, 'blocked')
  assert.deepEqual(keys(s.hardBlockers), ['inspections'])
})

test('no tracked inspections is advisory and does not claim compliance', () => {
  const s = evaluate({ inspectionCount: 0, inspectionsOutstandingCount: 0 })
  const item = s.items.find((i) => i.key === 'inspections')
  assert.equal(item?.policy, 'advisory')
  assert.equal(item?.state, 'needs_evidence')
  assert.equal(s.overall, 'ready')
})

test('advisory items warn without blocking', () => {
  const s = evaluate({ outstandingInvoiceCount: 2, pendingSignatureCount: 1, homeownerAcknowledged: false })
  assert.equal(s.overall, 'ready')
  assert.deepEqual(keys(s.warnings), ['financial_review', 'homeowner_acknowledgment', 'signatures'])
})

test('open punch items, unsigned walkthrough and missing homeowner need exceptions', () => {
  const s = evaluate({ openPunchItemCount: 4, latestFinalSignoff: 'rejected', homeownerCount: 0 })
  assert.equal(s.overall, 'needs_exceptions')
  assert.deepEqual(keys(s.blockers), ['builder_signoff', 'homeowner_linked', 'punch_list'])
})

test('disabled modules are not applicable instead of failing', () => {
  const s = evaluate({
    features: { ...ready.features, schedule: false, walkthroughs: false, warranty: false },
    finalWalkthroughSubmitted: false,
    latestFinalSignoff: null,
  })
  assert.equal(s.overall, 'ready')
  for (const key of ['schedule_activities', 'final_walkthrough', 'warranty_setup']) {
    assert.equal(s.items.find((i) => i.key === key)?.state, 'not_applicable')
  }
})

test('every gating item key is one the database recognizes', () => {
  const s = evaluate({ scheduleActivityCount: 0, inspectionsOutstandingCount: 1, openPunchItemCount: 1, finalWalkthroughSubmitted: false, homeownerCount: 0 })
  for (const b of s.blockers) assert.ok((GATED_REQUIREMENT_KEYS as readonly string[]).includes(b.key), b.key)
})

test('justifications must be substantive', () => {
  assert.equal(isSubstantiveJustification('N/A'), false)
  assert.equal(isSubstantiveJustification('skip'), false)
  assert.equal(isSubstantiveJustification('short reason'), false)
  assert.equal(isSubstantiveJustification('Homeowner moved in; painter returns Monday.'), true)
})
