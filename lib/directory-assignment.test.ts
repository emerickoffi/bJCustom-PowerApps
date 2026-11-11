import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMAIL_DELIVERY,
  bulkAssignSchema,
  classifyInsertError,
  emailEligibility,
  failedItems,
  itemKey,
  mergeResults,
  resolveNotification,
  suggestProjectRole,
  summarizeResults,
  type BulkAssignResult,
} from './directory-assignment.ts'

const P1 = '11111111-1111-4111-8111-111111111111'
const P2 = '22222222-2222-4222-8222-222222222222'
const C1 = '33333333-3333-4333-8333-333333333333'

const person = (id: string, extra: Record<string, unknown> = {}) => ({
  kind: 'person',
  id,
  person_company_id: null,
  project_role: 'Foreman',
  access: 'no_portal_access',
  notify: false,
  ...extra,
})

test('mixed person and company selection validates', () => {
  const r = bulkAssignSchema.safeParse([person(P1), { kind: 'company', id: C1 }])
  assert.equal(r.success, true)
})

test('a person needs a project role and an explicit access choice', () => {
  assert.equal(bulkAssignSchema.safeParse([person(P1, { project_role: '  ' })]).success, false)
  assert.equal(bulkAssignSchema.safeParse([person(P1, { access: undefined })]).success, false)
  assert.equal(bulkAssignSchema.safeParse([person(P1, { access: 'full_access' })]).success, false)
})

test('company items cannot carry a login, invitation, or access grant', () => {
  const r = bulkAssignSchema.safeParse([{ kind: 'company', id: C1, notify: true, access: 'full_access' }])
  assert.equal(r.success, true)
  assert.deepEqual(r.success && r.data[0], { kind: 'company', id: C1 })
})

test('duplicate selections are rejected', () => {
  assert.equal(bulkAssignSchema.safeParse([person(P1), person(P1)]).success, false)
  assert.equal(bulkAssignSchema.safeParse([]).success, false)
})

test('email eligibility explains missing, invalid, and unavailable delivery', () => {
  assert.match((emailEligibility(null, EMAIL_DELIVERY) as { reason: string }).reason, /No email/)
  assert.match((emailEligibility('nope', EMAIL_DELIVERY) as { reason: string }).reason, /not valid/)
  assert.match((emailEligibility('a@b.co', EMAIL_DELIVERY) as { reason: string }).reason, /not configured/)
  assert.deepEqual(emailEligibility('a@b.co', { available: true }), { eligible: true })
})

test('insert errors map to outcomes; unique violations make retries idempotent', () => {
  assert.equal(classifyInsertError(null).outcome, 'added')
  assert.equal(classifyInsertError({ code: '23505' }).outcome, 'already_assigned')
  assert.deepEqual(classifyInsertError({ code: 'P0001', message: 'Inactive subcontractors cannot be assigned to projects' }), {
    outcome: 'failed',
    reason: 'Inactive subcontractors cannot be assigned to projects.',
  })
  assert.equal(classifyInsertError({ code: '42501' }).outcome, 'failed')
  assert.doesNotMatch(classifyInsertError({ code: 'XX000', message: 'secret internals' }).reason ?? '', /secret/)
})

test('notifications only follow a new assignment and report why they were not sent', () => {
  const ok = { eligible: true } as const
  assert.equal(resolveNotification(false, 'added', ok).notification, 'not_requested')
  assert.equal(resolveNotification(true, 'added', ok).notification, 'sent')
  assert.equal(resolveNotification(true, 'already_assigned', ok).notification, 'not_sent')
  assert.equal(resolveNotification(true, 'failed', ok).notification, 'not_sent')
  const unavailable = resolveNotification(true, 'added', emailEligibility('a@b.co', EMAIL_DELIVERY))
  assert.equal(unavailable.notification, 'not_sent')
  assert.match(unavailable.notificationReason ?? '', /not configured/)
})

const result = (kind: 'person' | 'company', id: string, outcome: BulkAssignResult['outcome']): BulkAssignResult => ({
  key: itemKey(kind, id),
  kind,
  id,
  name: id,
  outcome,
  notification: 'not_requested',
})

test('retry resubmits only failed work and merges back into earlier results', () => {
  const submitted = [person(P1), person(P2), { kind: 'company' as const, id: C1 }] as { kind: 'person' | 'company'; id: string }[]
  const first = [result('person', P1, 'added'), result('person', P2, 'failed'), result('company', C1, 'already_assigned')]
  assert.deepEqual(failedItems(submitted, first).map((i) => i.id), [P2])
  const merged = mergeResults(first, [result('person', P2, 'added')])
  assert.deepEqual(summarizeResults(merged), { added: 2, alreadyAssigned: 1, failed: 0, notificationsSent: 0, notificationsNotSent: 0 })
})

test('project role suggestions only use approved roles', () => {
  assert.equal(suggestProjectRole('Engineer'), 'Engineer')
  assert.equal(suggestProjectRole('architect'), 'Architect')
  assert.equal(suggestProjectRole('Account Manager'), 'Supplier Representative')
  // A company job title doesn't say which project responsibility someone holds, so these never pre-fill.
  assert.equal(suggestProjectRole('Foreman'), '')
  assert.equal(suggestProjectRole('owner'), '')
  assert.equal(suggestProjectRole('Billing Contact'), '')
  assert.equal(suggestProjectRole(null), '')
})
