import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessProjectHealth, hasVerifiedCostEvidence, HEALTH_LABELS, type HealthCostEvidence, type HealthInput } from './project-health.ts'

const none: HealthCostEvidence = { approvedCommitments: 0, committedTotal: 0, approvedBills: 0, actualTotal: 0, forecastLines: 0 }
const estimate = (total: number) => [{ estimate_number: 'E-1', status: 'approved', construction_total: total, estimate_date: '2026-06-01' }]
const base: HealthInput = {
  today: '2026-10-28',
  status: 'in_progress',
  targetCompletionDate: '2027-03-01',
  completionDate: null,
  schedule: [{ name: 'Framing', status: 'completed', planned_start: '2026-09-01', planned_end: '2026-09-20' }],
  financial: { budget: 400000, estimates: estimate(400000), costEvidence: none },
  issues: { open: [], awaitingBuilderApproval: 0, awaitingHomeownerConfirmation: 0 },
  signatures: { awaiting: 0, problems: 0 },
}
const financial = (f: NonNullable<HealthInput['financial']>) => assessProjectHealth({ ...base, financial: f }).dimensions.financial

test('Not Assessed label exists', () => {
  assert.equal(HEALTH_LABELS.not_assessed, 'Not Assessed')
})

test('regression: approved budget with no commitments, bills, or forecasts is Not Assessed, never On Track', () => {
  const d = financial({ budget: 400000, estimates: estimate(400000), costEvidence: none })
  assert.equal(d.level, 'not_assessed')
  assert.match(d.reasons[0], /no approved commitments, approved vendor bills, or cost forecasts/)
  assert.match(d.reasons[1], /^Preliminary budget-based projection: Estimate E-1 is within the recorded budget\.$/)
})

test('missing or unloaded cost evidence fails closed to Not Assessed', () => {
  for (const costEvidence of [undefined, null]) {
    const d = financial({ budget: 400000, estimates: estimate(390000), costEvidence })
    assert.equal(d.level, 'not_assessed')
    assert.match(d.reasons[0], /could not be loaded/)
    assert.equal(d.facts.cost_evidence, 'not available')
  }
})

test('preliminary projection preserves calculations and is labeled', () => {
  const d = financial({ budget: 400000, estimates: estimate(390000), costEvidence: none })
  assert.equal(d.facts.recorded_budget, 400000)
  assert.equal(d.facts.estimate_construction_total, 390000)
  assert.equal(d.facts.variance, -10000)
  assert.equal(d.facts.variance_percent, -2.5)
  assert.match(String(d.facts.estimate_comparison_basis), /preliminary/)
})

test('preliminary over-budget estimate still raises a warning, labeled preliminary', () => {
  const attention = financial({ budget: 400000, estimates: estimate(430000), costEvidence: none })
  assert.equal(attention.level, 'needs_attention')
  assert.match(attention.reasons[0], /^Preliminary budget-based projection: /)
  assert.equal(financial({ budget: 400000, estimates: estimate(450000), costEvidence: none }).level, 'at_risk')
})

test('Not Assessed does not drive the overall indicator', () => {
  const r = assessProjectHealth(base)
  assert.equal(r.dimensions.financial.level, 'not_assessed')
  assert.equal(r.indicator, 'on_track')
  const all = assessProjectHealth({ ...base, schedule: null, issues: null, signatures: null, targetCompletionDate: null })
  assert.equal(all.indicator, 'insufficient_data')
})

test('verified evidence within budget is On Track', () => {
  for (const ev of [
    { ...none, approvedCommitments: 2, committedTotal: 250000 },
    { ...none, approvedBills: 1, actualTotal: 50000 },
    { ...none, forecastLines: 3 },
  ]) {
    const d = financial({ budget: 400000, estimates: estimate(400000), costEvidence: ev })
    assert.equal(d.level, 'on_track')
    assert.equal(d.reasons[1], 'Estimate E-1 is within the recorded budget.')
  }
})

test('verified evidence over budget raises warnings', () => {
  assert.equal(financial({ budget: 400000, estimates: estimate(400000), costEvidence: { ...none, approvedCommitments: 1, committedTotal: 410000 } }).level, 'needs_attention')
  const risk = financial({ budget: 400000, estimates: estimate(400000), costEvidence: { ...none, approvedBills: 1, actualTotal: 410000 } })
  assert.equal(risk.level, 'at_risk')
  assert.equal(risk.reasons[0], 'Approved vendor bills exceed the recorded budget.')
})

test('verified evidence without an estimate is still assessed', () => {
  assert.equal(financial({ budget: 400000, estimates: [], costEvidence: { ...none, approvedCommitments: 1, committedTotal: 1000 } }).level, 'on_track')
})

test('existing insufficient-data cases are unchanged', () => {
  assert.equal(financial({ budget: null, estimates: estimate(1) }).level, 'insufficient_data')
  assert.equal(financial({ budget: 400000, estimates: [], costEvidence: none }).level, 'insufficient_data')
  assert.equal(assessProjectHealth({ ...base, financial: null }).dimensions.financial.level, 'insufficient_data')
})

test('hasVerifiedCostEvidence', () => {
  assert.equal(hasVerifiedCostEvidence(null), false)
  assert.equal(hasVerifiedCostEvidence(none), false)
  assert.equal(hasVerifiedCostEvidence({ ...none, forecastLines: 1 }), true)
})
