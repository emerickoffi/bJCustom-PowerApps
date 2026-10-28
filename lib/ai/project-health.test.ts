import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessProjectHealth, comparableEstimate, isActivityOverdue, type HealthInput } from './project-health.ts'

const today = '2026-10-28'
const base: HealthInput = {
  today,
  status: 'in_progress',
  targetCompletionDate: '2027-03-01',
  completionDate: null,
  schedule: [
    { name: 'Framing', status: 'completed', planned_start: '2026-09-01', planned_end: '2026-09-20' },
    { name: 'Roofing', status: 'in_progress', planned_start: '2026-10-20', planned_end: '2026-11-10' },
  ],
  financial: { budget: 400000, estimates: [{ estimate_number: 'E-1', status: 'approved', construction_total: 400000, estimate_date: '2026-06-01' }] },
  issues: { open: [], awaitingBuilderApproval: 0, awaitingHomeownerConfirmation: 0 },
  signatures: { awaiting: 0, problems: 0 },
}

test('healthy project is On Track', () => {
  const r = assessProjectHealth(base)
  assert.equal(r.indicator, 'on_track')
  assert.equal(r.indicator_label, 'On Track')
})

test('overdue uses the app rule: completed and skipped are never overdue', () => {
  assert.equal(isActivityOverdue({ status: 'completed', planned_end: '2026-01-01' }, today), false)
  assert.equal(isActivityOverdue({ status: 'skipped', planned_end: '2026-01-01' }, today), false)
  assert.equal(isActivityOverdue({ status: 'not_started', planned_end: '2026-10-27' }, today), true)
  assert.equal(isActivityOverdue({ status: 'not_started', planned_end: today }, today), false)
})

test('one overdue activity needs attention; three are at risk', () => {
  const late = (name: string) => ({ name, status: 'not_started', planned_start: '2026-09-01', planned_end: '2026-10-01' })
  assert.equal(assessProjectHealth({ ...base, schedule: [late('A')] }).dimensions.schedule.level, 'needs_attention')
  const r = assessProjectHealth({ ...base, schedule: [late('A'), late('B'), late('C')] })
  assert.equal(r.dimensions.schedule.level, 'at_risk')
  assert.equal(r.indicator, 'at_risk')
})

test('completed project is never treated as delayed', () => {
  const r = assessProjectHealth({
    ...base,
    status: 'completed',
    targetCompletionDate: '2026-01-01',
    completionDate: '2026-02-01',
    schedule: [{ name: 'Punch', status: 'not_started', planned_start: '2025-12-01', planned_end: '2025-12-15' }],
  })
  assert.equal(r.dimensions.schedule.level, 'on_track')
})

test('target date passed without completion is at risk', () => {
  assert.equal(assessProjectHealth({ ...base, targetCompletionDate: '2026-10-01' }).dimensions.schedule.level, 'at_risk')
})

test('financial thresholds and estimate preference', () => {
  const withTotal = (total: number) => ({ budget: 400000, estimates: [{ estimate_number: 'E', status: 'approved', construction_total: total, estimate_date: null }] })
  assert.equal(assessProjectHealth({ ...base, financial: withTotal(415000) }).dimensions.financial.level, 'on_track')
  assert.equal(assessProjectHealth({ ...base, financial: withTotal(430000) }).dimensions.financial.level, 'needs_attention')
  assert.equal(assessProjectHealth({ ...base, financial: withTotal(450000) }).dimensions.financial.level, 'at_risk')
  assert.equal(
    comparableEstimate([
      { estimate_number: 'D', status: 'draft', construction_total: 1, estimate_date: null },
      { estimate_number: 'S', status: 'submitted', construction_total: 2, estimate_date: null },
      { estimate_number: 'A', status: 'approved', construction_total: 3, estimate_date: null },
    ])?.estimate_number,
    'A',
  )
  assert.equal(comparableEstimate([{ estimate_number: 'D', status: 'draft', construction_total: 1, estimate_date: null }]), null)
})

test('missing data is Insufficient Data and never lowers the overall result', () => {
  const r = assessProjectHealth({ ...base, financial: { budget: null, estimates: [] } })
  assert.equal(r.dimensions.financial.level, 'insufficient_data')
  assert.equal(r.indicator, 'on_track')
  const none = assessProjectHealth({ ...base, schedule: null, financial: null, issues: null, signatures: null })
  assert.equal(none.indicator, 'insufficient_data')
})

test('critical open issue is at risk; signature problems need attention', () => {
  const critical = assessProjectHealth({ ...base, issues: { open: [{ priority: 'critical', status: 'open', due_date: null }], awaitingBuilderApproval: 0, awaitingHomeownerConfirmation: 0 } })
  assert.equal(critical.dimensions.issues_and_approvals.level, 'at_risk')
  const sig = assessProjectHealth({ ...base, signatures: { awaiting: 2, problems: 1 } })
  assert.equal(sig.dimensions.issues_and_approvals.level, 'needs_attention')
  const pendingOnly = assessProjectHealth({ ...base, signatures: { awaiting: 3, problems: 0 } })
  assert.equal(pendingOnly.dimensions.issues_and_approvals.level, 'on_track')
})
