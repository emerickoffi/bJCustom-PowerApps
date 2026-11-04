import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeTitleRequestError, titleEditEligibility, titleEditRequestSchema } from './estimate-title.ts'

const base = {
  estimateId: '3f1c2a7e-1b2c-4d5e-8f90-123456789abc',
  organizationId: '9a1c2a7e-1b2c-4d5e-8f90-123456789abc',
  expectedUpdatedAt: '2026-03-11T10:00:00.123456+00:00',
  name: '  Kitchen remodel  ',
}

test('accepts a title-only request and trims the name', () => {
  const r = titleEditRequestSchema.safeParse(base)
  assert.equal(r.success, true)
  assert.equal(r.success && r.data.name, 'Kitchen remodel')
})

for (const extra of [
  { construction_total_cents: 1 },
  { status: 'approved' },
  { project_id: base.estimateId },
  { organization_id: base.organizationId },
  { editable: true },
]) {
  test(`rejects protected field ${Object.keys(extra)[0]}`, () => {
    const r = titleEditRequestSchema.safeParse({ ...base, ...extra })
    assert.equal(r.success, false)
    assert.equal(!r.success && describeTitleRequestError(r.error).message, 'Only the estimate title can be changed here.')
  })
}

test('uses the existing estimate name validation', () => {
  for (const name of ['', ' a ', 'x'.repeat(161)]) {
    const r = titleEditRequestSchema.safeParse({ ...base, name })
    assert.equal(r.success, false)
    assert.equal(!r.success && describeTitleRequestError(r.error).field, true)
  }
})

test('rejects malformed ids', () => {
  assert.equal(titleEditRequestSchema.safeParse({ ...base, estimateId: 'nope' }).success, false)
  assert.equal(titleEditRequestSchema.safeParse({ ...base, organizationId: 'nope' }).success, false)
})

test('eligibility follows manager role, latest revision and editable status', () => {
  assert.deepEqual(titleEditEligibility({ canManage: true, status: 'draft', isLatest: true }), { editable: true })
  assert.deepEqual(titleEditEligibility({ canManage: true, status: 'internal_review', isLatest: true }), { editable: true })
  for (const status of ['submitted', 'approved', 'rejected'] as const) {
    assert.equal(titleEditEligibility({ canManage: true, status, isLatest: true }).editable, false)
  }
  assert.equal(titleEditEligibility({ canManage: false, status: 'draft', isLatest: true }).editable, false)
  assert.equal(titleEditEligibility({ canManage: true, status: 'draft', isLatest: false }).editable, false)
})
