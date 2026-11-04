import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalPayload, classifyThrown, draftKey, fingerprint, isConflictMessage, resolveRequestId } from './save-requests.ts'

test('canonical payload ignores control fields and is order-stable by key', () => {
  const a = canonicalPayload([
    ['title', 'Deck'],
    ['_request_id', 'r1'],
    ['$ACTION_ID_abc', ''],
    ['crew_trade', 'Framing'],
    ['crew_trade', 'Roofing'],
    ['intent', 'photos'],
  ])
  const b = canonicalPayload([
    ['crew_trade', 'Framing'],
    ['title', 'Deck'],
    ['crew_trade', 'Roofing'],
    ['_request_id', 'r2'],
  ])
  assert.equal(a, b)
  assert.ok(!a.includes('r1'))
})

test('repeated values keep their order, so reordering crews is a different payload', () => {
  const a = canonicalPayload([['crew_trade', 'A'], ['crew_trade', 'B']])
  const b = canonicalPayload([['crew_trade', 'B'], ['crew_trade', 'A']])
  assert.notEqual(a, b)
})

test('identical retry reuses the request id; a changed payload gets a new one', () => {
  const fp = fingerprint(canonicalPayload([['title', 'Deck']]))
  const pending = { requestId: 'req-1', fingerprint: fp, startedAt: 0 }
  let n = 0
  const make = () => `new-${++n}`
  assert.equal(resolveRequestId(pending, fp, make), 'req-1')
  const changed = fingerprint(canonicalPayload([['title', 'Deck 2']]))
  assert.equal(resolveRequestId(pending, changed, make), 'new-1')
  assert.equal(resolveRequestId(undefined, fp, make), 'new-2')
})

test('fingerprint is deterministic and sensitive to small changes', () => {
  assert.equal(fingerprint('abc'), fingerprint('abc'))
  assert.notEqual(fingerprint('abc'), fingerprint('abd'))
})

test('draft keys are scoped by user, org, form, project and record', () => {
  const base = { userId: 'u1', orgId: 'o1', formType: 'daily_log', projectId: 'p1' }
  assert.notEqual(draftKey(base), draftKey({ ...base, userId: 'u2' }))
  assert.notEqual(draftKey(base), draftKey({ ...base, orgId: 'o2' }))
  assert.notEqual(draftKey(base), draftKey({ ...base, recordId: 'r1' }))
  assert.equal(draftKey(base), 'v1:u1:o1:daily_log:p1:new')
})

test('conflict messages from existing guards are recognised', () => {
  assert.ok(isConflictMessage('This log was changed by someone else. Reload the page to see the latest version.'))
  assert.ok(isConflictMessage('This change order was updated by someone else. Refresh and try again.'))
  assert.ok(!isConflictMessage('Enter a title'))
})

test('thrown errors: auth redirects pause, other redirects pass through, unknown is unconfirmed', () => {
  assert.equal(classifyThrown({ digest: 'NEXT_REDIRECT;replace;/auth/login;307;' }).kind, 'auth')
  assert.equal(classifyThrown({ digest: 'NEXT_REDIRECT;push;/estimates/1;303;' }).kind, 'redirect')
  assert.equal(classifyThrown({ digest: 'NEXT_HTTP_ERROR_FALLBACK;404' }).kind, 'forbidden')
  assert.equal(classifyThrown(new TypeError('Failed to fetch')).kind, 'network')
})
