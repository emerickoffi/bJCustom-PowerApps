import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  companyProjectDetail,
  contactPreference,
  isContactPreviewKey,
  mergeCompanyProjects,
  personPreviewApiPath,
  pickClientContacts,
  pickPersonAccess,
  recordPreviewErrorState,
  summarizePortalAccounts,
} from './record-preview.ts'

test('a person without a subcontractor company has no portal access to manage', () => {
  assert.deepEqual(pickPersonAccess('a@example.com', [], []), { state: 'ready', status: 'none', company: null, manageHref: null })
})

test('portal access matches the person by email, case-insensitively, and prefers an active login', () => {
  const linked = [
    { subcontractorId: 's1', companyName: 'Alpha Electric' },
    { subcontractorId: 's2', companyName: 'Beta Plumbing' },
  ]
  const access = pickPersonAccess(' Pat@Example.com ', linked, [
    { subcontractor_company_id: 's1', email: 'pat@example.com', status: 'revoked' },
    { subcontractor_company_id: 's2', email: 'PAT@example.com', status: 'active' },
    { subcontractor_company_id: 's1', email: 'someone.else@example.com', status: 'active' },
  ])
  assert.deepEqual(access, { state: 'ready', status: 'active', company: 'Beta Plumbing', manageHref: '/subcontractors/s2' })
})

test("another person's login at the same company never counts as this person's access", () => {
  const access = pickPersonAccess('pat@example.com', [{ subcontractorId: 's1', companyName: 'Alpha Electric' }], [
    { subcontractor_company_id: 's1', email: 'owner@example.com', status: 'active' },
  ])
  assert.equal(access.status, 'none')
  assert.equal(access.manageHref, '/subcontractors/s1')
})

test('a revoked login is reported as revoked, not as missing', () => {
  const access = pickPersonAccess('pat@example.com', [{ subcontractorId: 's1', companyName: 'Alpha Electric' }], [
    { subcontractor_company_id: 's1', email: 'pat@example.com', status: 'revoked' },
  ])
  assert.equal(access.status, 'revoked')
})

test('company projects keep the company assignment apart from individually assigned people', () => {
  const projects = mergeCompanyProjects(
    [{ id: 'p1', name: 'Maple Remodel', number: 'P-1' }],
    [
      { id: 'p2', name: 'Birch Addition', number: 'P-2', person: 'Sam Lee', role: 'Estimator' },
      { id: 'p1', name: 'Maple Remodel', number: 'P-1', person: 'Sam Lee', role: null },
      { id: 'p1', name: 'Maple Remodel', number: 'P-1', person: 'Sam Lee', role: null },
    ],
  )
  assert.deepEqual(
    projects.map((p) => [p.name, p.company, p.people]),
    [
      ['Birch Addition', false, ['Sam Lee (Estimator)']],
      ['Maple Remodel', true, ['Sam Lee']],
    ],
  )
  assert.equal(companyProjectDetail(projects[0]), 'Sam Lee (Estimator) assigned individually')
  assert.equal(companyProjectDetail(projects[1]), 'Company assigned · Sam Lee assigned individually')
  assert.equal(companyProjectDetail({ company: true, people: [] }), 'Company assigned')
})

const client = { first_name: 'Dana', last_name: 'Reyes', email: 'dana@example.com', phone: '555-0100', preferred_communication: 'email' }
const row = (id: string, first: string, primary: boolean, relationship: string | null) => ({
  id,
  first_name: first,
  last_name: 'Reyes',
  email: null,
  phone: null,
  relationship,
  is_primary: primary,
})

test('the client record stands in as primary contact when no contact row is flagged primary', () => {
  const picked = pickClientContacts(client, [])
  assert.equal(picked.primary.name, 'Dana Reyes')
  assert.equal(picked.primary.relationship, null)
  assert.equal(picked.primary.email, 'dana@example.com')
  assert.equal(picked.secondary, null)
  assert.equal(picked.otherCount, 0)
})

test('primary and secondary contacts come from the stored rows, and a relationship is never inferred', () => {
  const picked = pickClientContacts(client, [row('c1', 'Dana', true, 'other'), row('c2', 'Alex', false, 'not-a-known-value'), row('c3', 'Jo', false, null)])
  assert.equal(picked.primary.name, 'Dana Reyes')
  assert.equal(picked.primary.relationship, null)
  assert.equal(picked.secondary?.name, 'Alex Reyes')
  assert.equal(picked.secondary?.relationship, null)
  assert.equal(picked.otherCount, 1)
})

test('contact preference is shown only for a known method', () => {
  assert.equal(contactPreference(null), null)
  assert.equal(contactPreference('carrier-pigeon'), null)
  assert.match(contactPreference('email') ?? '', /^Prefers /)
})

test('portal summary never understates existing access', () => {
  assert.equal(summarizePortalAccounts([]), null)
  assert.deepEqual(summarizePortalAccounts([{ status: 'active', activationRequired: true }]), {
    status: 'pending',
    detail: '1 login awaiting first sign-in',
  })
  assert.deepEqual(summarizePortalAccounts([{ status: 'suspended', activationRequired: false }, { status: null, activationRequired: false }]), {
    status: 'suspended',
    detail: '2 logins suspended',
  })
  assert.deepEqual(
    summarizePortalAccounts([
      { status: 'active', activationRequired: false },
      { status: 'active', activationRequired: true },
      { status: 'suspended', activationRequired: false },
    ]),
    { status: 'active', detail: '1 login active · 1 awaiting first sign-in · 1 suspended' },
  )
})

test('only transient failures offer a retry, and each names its record type', () => {
  assert.deepEqual(recordPreviewErrorState(403, 'client'), { message: 'You do not have access to this client.', retry: false })
  assert.equal(recordPreviewErrorState(404, 'company').retry, false)
  assert.equal(recordPreviewErrorState(401, 'contact').retry, false)
  assert.deepEqual(recordPreviewErrorState(500, 'contact'), { message: 'Contact details could not be loaded.', retry: true })
  assert.equal(recordPreviewErrorState(null, 'company').retry, true)
})

test('contact preview keys cover people and companies only', () => {
  assert.equal(isContactPreviewKey(personPreviewApiPath('abc')), true)
  assert.equal(isContactPreviewKey('/api/contacts/companies/abc/preview'), true)
  assert.equal(isContactPreviewKey('/api/clients/abc/preview'), false)
  assert.equal(isContactPreviewKey(null), false)
})
