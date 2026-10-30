import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assignmentWarning,
  buildQualificationAttention,
  daysUntil,
  expiryTier,
  matchesQualificationFilter,
  parseQualificationFilter,
  primaryActionLabel,
  qualificationBadge,
  validateEvidenceFile,
  type QualificationSummary,
} from './subcontractor-qualification.ts'

function summary(overrides: Partial<QualificationSummary> = {}): QualificationSummary {
  return {
    subcontractor_company_id: 'c1',
    status: 'pending',
    started_at: '2026-10-01T00:00:00Z',
    mandatory_total: 10,
    mandatory_satisfied: 6,
    rejected_count: 0,
    expired_count: 0,
    awaiting_review_count: 0,
    missing_count: 4,
    expiring_soon_count: 0,
    next_expiration: null,
    last_reviewed_at: null,
    decision_outcome: null,
    decision_at: null,
    decision_by: null,
    decision_template_version: null,
    template_version: 1,
    assignment_mode: 'advisory',
    criteria_met: false,
    ...overrides,
  }
}

test('badge labels and tones follow the database status', () => {
  assert.deepEqual(qualificationBadge(null), { label: 'Not Started', tone: 'neutral' })
  assert.deepEqual(qualificationBadge(summary()), { label: 'Pending 6/10', tone: 'warning' })
  assert.deepEqual(qualificationBadge(summary({ status: 'qualified' })), { label: 'Qualified', tone: 'success' })
  assert.deepEqual(qualificationBadge(summary({ status: 'not_cleared' })), { label: 'Not Cleared', tone: 'danger' })
})

test('filters treat companies without a summary as Not Started', () => {
  assert.equal(parseQualificationFilter('qualified'), 'qualified')
  assert.equal(parseQualificationFilter('bogus'), null)
  assert.equal(matchesQualificationFilter(undefined, 'not_started'), true)
  assert.equal(matchesQualificationFilter(undefined, 'pending'), false)
  assert.equal(matchesQualificationFilter(summary({ status: 'qualified', expiring_soon_count: 1 }), 'expiring_soon'), true)
  assert.equal(matchesQualificationFilter(summary({ status: 'qualified' }), 'expiring_soon'), false)
})

test('primary action follows status', () => {
  assert.equal(primaryActionLabel('not_started'), 'Start Vetting')
  assert.equal(primaryActionLabel('pending'), 'Continue Vetting')
  assert.equal(primaryActionLabel('qualified'), 'Review Qualification')
  assert.equal(primaryActionLabel('not_cleared'), 'Review Qualification')
})

test('expiry tiers at 30, 14, 7 days and expired', () => {
  const today = '2026-10-30'
  assert.equal(daysUntil('2026-11-29', today), 30)
  assert.equal(expiryTier('2026-11-30', today), null)
  assert.equal(expiryTier('2026-11-29', today), '30')
  assert.equal(expiryTier('2026-11-13', today), '14')
  assert.equal(expiryTier('2026-11-06', today), '7')
  assert.equal(expiryTier('2026-10-30', today), '7')
  assert.equal(expiryTier('2026-10-29', today), 'expired')
  assert.equal(expiryTier(null, today), null)
})

test('advisory mode warns without blocking; enforcement blocks anything not qualified', () => {
  assert.equal(assignmentWarning(summary({ status: 'qualified' }), 'enforcement'), null)
  assert.equal(assignmentWarning(summary(), 'advisory')?.level, 'warn')
  assert.equal(assignmentWarning(null, 'advisory')?.level, 'warn')
  assert.equal(assignmentWarning(summary({ status: 'not_cleared' }), 'enforcement')?.level, 'block')
  assert.equal(assignmentWarning(null, 'enforcement')?.level, 'block')
  assert.equal(assignmentWarning(summary({ status: 'qualified', expiring_soon_count: 2 }), 'enforcement')?.level, 'warn')
})

test('attention picks the most urgent issue per active company and skips inactive ones', () => {
  const items = buildQualificationAttention(
    [
      { summary: summary({ subcontractor_company_id: 'a', missing_count: 2 }), companyName: 'Alpha', companyActive: true, currentProjects: 0 },
      { summary: summary({ subcontractor_company_id: 'b', status: 'not_cleared', expired_count: 1 }), companyName: 'Bravo', companyActive: true, currentProjects: 2 },
      { summary: summary({ subcontractor_company_id: 'c', awaiting_review_count: 1 }), companyName: 'Charlie', companyActive: true, currentProjects: 0 },
      { summary: summary({ subcontractor_company_id: 'd', expired_count: 1 }), companyName: 'Delta', companyActive: false, currentProjects: 1 },
      { summary: summary({ subcontractor_company_id: 'e', status: 'not_started', started_at: null }), companyName: 'Echo', companyActive: true, currentProjects: 0 },
    ],
    '2026-10-30',
  )
  assert.deepEqual(
    items.map((i) => [i.companyName, i.kind]),
    [
      ['Bravo', 'not_cleared_on_project'],
      ['Charlie', 'awaiting_review'],
      ['Alpha', 'missing'],
    ],
  )
  assert.equal(items[0].href, '/subcontractors/b#qualification')
})

test('evidence file validation', () => {
  assert.equal(validateEvidenceFile({ name: 'coi.pdf', size: 10, type: 'application/pdf' }), null)
  assert.match(validateEvidenceFile({ name: 'a.docx', size: 10, type: 'application/msword' }) ?? '', /not a supported/)
  assert.match(validateEvidenceFile({ name: 'a.pdf', size: 0, type: 'application/pdf' }) ?? '', /empty/)
  assert.match(validateEvidenceFile({ name: 'a.pdf', size: 26 * 1024 * 1024, type: 'application/pdf' }) ?? '', /25 MB/)
})
