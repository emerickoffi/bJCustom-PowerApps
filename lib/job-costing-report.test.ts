import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { JobCostSummary } from './job-costing.ts'
import { reportRow, reportTotals, sortReportRows } from './job-costing-report.ts'
import { cell, csv, datasetByKey, datasetCsv, dollars, jobCostingCsv, DATASETS } from './data-exports.ts'
import { FEATURES, isSwitchable } from './feature-registry.ts'

function summary(over: Partial<JobCostSummary> = {}): JobCostSummary {
  return {
    budgetEstablished: true,
    costTrackingAvailable: true,
    originalCostCents: 400_000_00,
    revisedCostCents: 420_000_00,
    committedCents: 300_000_00,
    actualCents: 250_000_00,
    laborCents: 20_000_00,
    paidToVendorsCents: 200_000_00,
    payableCents: 50_000_00,
    etcCents: 170_000_00,
    forecastCents: 420_000_00,
    forecastVarianceCents: 0,
    contractRevenueCents: 500_000_00,
    billedCents: 300_000_00,
    collectedCents: 250_000_00,
    homeownerOutstandingCents: 50_000_00,
    grossProfitCents: 80_000_00,
    grossMarginBasisPoints: 1600,
    groups: [],
    alerts: [],
    ...over,
  }
}
const project = (id: string, name: string) => ({ id, project_number: `TF-${id}`, name, status: 'under_construction' })

test('a row carries the project Financials numbers and flags over budget and low margin', () => {
  const ok = reportRow(project('1', 'Lee'), summary())
  assert.equal(ok.flag, null)
  assert.equal(ok.contractCents, 500_000_00)
  assert.equal(ok.profitCents, 80_000_00)
  const over = reportRow(project('2', 'Ortiz'), summary({ forecastVarianceCents: -15_000_00, grossProfitCents: 65_000_00, grossMarginBasisPoints: 1300 }))
  assert.equal(over.flag, 'over')
  const thin = reportRow(project('3', 'Park'), summary({ grossMarginBasisPoints: 800 }))
  assert.equal(thin.flag, 'low_margin')
  const none = reportRow(project('4', 'New'), summary({ budgetEstablished: false, contractRevenueCents: null, revisedCostCents: null, forecastCents: null, forecastVarianceCents: null, grossProfitCents: null, grossMarginBasisPoints: null }))
  assert.equal(none.noBudget, true)
  assert.equal(reportRow(project('5', 'Broken'), null).failed, true)
})

test('totals only add jobs with a budget, and margin is recomputed from the totals', () => {
  const rows = [
    reportRow(project('1', 'A'), summary()),
    reportRow(project('2', 'B'), summary({ contractRevenueCents: 100_000_00, grossProfitCents: -10_000_00, forecastVarianceCents: -10_000_00 })),
    reportRow(project('3', 'C'), summary({ budgetEstablished: false, contractRevenueCents: null, grossProfitCents: null, billedCents: 5_000_00, collectedCents: 0 })),
  ]
  const t = reportTotals(rows)
  assert.equal(t.jobs, 3)
  assert.equal(t.noBudget, 1)
  assert.equal(t.overBudget, 1)
  assert.equal(t.contractCents, 600_000_00)
  assert.equal(t.profitCents, 70_000_00)
  assert.equal(t.marginBasisPoints, 1167)
  assert.equal(t.billedCents, 605_000_00)
})

test('jobs needing attention are listed first', () => {
  const rows = sortReportRows([
    reportRow(project('1', 'Alpha'), summary()),
    reportRow(project('2', 'Zulu'), summary({ forecastVarianceCents: -1 })),
    reportRow(project('3', 'Mike'), summary({ grossMarginBasisPoints: 500 })),
  ])
  assert.deepEqual(rows.map((r) => r.name), ['Zulu', 'Mike', 'Alpha'])
})

test('CSV keeps numbers as numbers, neutralizes formulas, and quotes when needed', () => {
  assert.equal(cell(-1500.5), '-1500.5')
  assert.equal(cell('-1500'), "'-1500")
  assert.equal(cell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(cell('Smith, Jr.'), '"Smith, Jr."')
  assert.equal(cell(null), '')
  assert.equal(dollars(123456), 1234.56)
  assert.equal(dollars(null), null)
  assert.ok(csv(['A'], [[1]]).startsWith('﻿A\r\n1'))
})

test('job costing CSV writes dollars and margin percent', () => {
  const out = jobCostingCsv([reportRow(project('1', 'Lee'), summary({ forecastVarianceCents: -2_500_00 }))])
  const line = out.split('\r\n')[1]
  assert.ok(line.includes('500000,420000,250000,420000,-2500,80000,16'), line)
  assert.ok(line.endsWith('Over budget'))
})

test('every export has columns and resolves names through the lookups', () => {
  for (const d of DATASETS) assert.ok(d.columns.length > 3, d.key)
  const projects = datasetByKey('projects')!
  const out = datasetCsv(projects, [{ name: 'Lee Residence', primary_client_id: 'c1', project_manager_id: 'u1', estimated_budget_cents: 65000000 }], {
    projectName: () => '',
    clientName: (id) => (id === 'c1' ? 'Jordan Lee' : ''),
    personName: (id) => (id === 'u1' ? 'Pat PM' : ''),
    invoiceNumber: () => '',
  })
  assert.ok(out.includes('Lee Residence,Jordan Lee'))
  assert.ok(out.includes('Pat PM'))
  assert.ok(out.includes('650000'))
  assert.equal(datasetByKey('nope'), null)
})

test('both new modules can be switched on and off', () => {
  for (const key of ['project_reports', 'data_exports']) {
    const f = FEATURES.find((x) => x.key === key)!
    assert.equal(isSwitchable(f), true, key)
  }
})
