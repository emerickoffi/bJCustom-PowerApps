import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deterministicUuid, estimateApprovalFromSignature, signedDocumentIds, signedDocumentName } from './signed-artifacts.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('deterministic ids are stable, valid, and distinct per request', () => {
  assert.equal(deterministicUuid('a'), deterministicUuid('a'))
  assert.match(deterministicUuid('a'), UUID)
  const one = signedDocumentIds('req-1')
  assert.deepEqual(one, signedDocumentIds('req-1'))
  assert.notEqual(one.documentId, one.versionId)
  assert.notEqual(one.documentId, signedDocumentIds('req-2').documentId)
})

test('signed document name stays within 200 characters', () => {
  assert.equal(signedDocumentName('Estimate EST-0002 Rev 1'), 'Estimate EST-0002 Rev 1 — Signed')
  assert.equal(signedDocumentName('x'.repeat(250)).length, 200)
})

const base = {
  requestStatus: 'completed',
  testMode: false,
  requestDocumentId: 'doc',
  requestSourceVersionId: 'ver',
  snapshot: { document_id: 'doc', version_id: 'ver' } as { document_id: string | null; version_id: string | null } | null,
  estimateStatus: 'submitted',
  signerNames: ['Jane Owner', 'John Owner', 'Jane Owner'],
}

test('approves only the matching, completed, live estimate signature', () => {
  assert.deepEqual(estimateApprovalFromSignature(base), { approve: true, decisionByName: 'Jane Owner, John Owner' })
})

test('leaves unrelated or ineligible signature requests alone', () => {
  const reason = (over: Partial<typeof base>) => {
    const r = estimateApprovalFromSignature({ ...base, ...over })
    return r.approve ? 'approved' : r.reason
  }
  assert.equal(reason({ requestStatus: 'partially_signed' }), 'not_completed')
  assert.equal(reason({ requestStatus: 'declined' }), 'not_completed')
  assert.equal(reason({ snapshot: null }), 'not_estimate')
  assert.equal(reason({ requestDocumentId: 'other-doc' }), 'not_estimate')
  assert.equal(reason({ requestSourceVersionId: 'other-ver' }), 'not_estimate')
  assert.equal(reason({ testMode: true }), 'test_mode')
  assert.equal(reason({ estimateStatus: 'approved' }), 'not_submitted')
  assert.equal(reason({ estimateStatus: 'draft' }), 'not_submitted')
  assert.equal(reason({ signerNames: ['  '] }), 'no_signers')
})

test('rejects cross-project requests and signatures completed after expiration', () => {
  const reason = (over: Record<string, unknown>) => {
    const r = estimateApprovalFromSignature({ ...base, ...over })
    return r.approve ? 'approved' : r.reason
  }
  assert.equal(reason({ sameProject: false }), 'not_estimate')
  assert.equal(reason({ estimateExpirationDate: '2026-10-01', completedAt: '2026-10-02T09:00:00Z' }), 'expired')
  assert.equal(reason({ estimateExpirationDate: '2026-10-01', completedAt: '2026-10-01T23:00:00Z' }), 'approved')
  assert.equal(reason({ estimateExpirationDate: null, completedAt: '2026-10-02T09:00:00Z' }), 'approved')
})
