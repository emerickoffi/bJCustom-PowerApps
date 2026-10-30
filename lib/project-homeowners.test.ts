import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ADDITIONAL_CONTACT_RELATIONSHIPS,
  derivePortalStatus,
  findPossibleDuplicates,
  isAdditionalContactRelationship,
  isContactVisibleOnProject,
} from './project-homeowners.ts'

const base = { first_name: '', last_name: '', email: null, phone: null, alternate_phone: null }
const existing = [
  { ...base, id: 'a', first_name: 'Jane', last_name: 'Doe', email: 'Jane@Example.com', phone: '(555) 123-4567' },
  { ...base, id: 'b', first_name: 'Sam', last_name: 'Lee', alternate_phone: '+1 555 999 0000' },
]

test('professional relationships are not offered for additional homeowner contacts', () => {
  for (const r of ['real_estate_agent', 'attorney', 'property_manager', 'primary_owner']) {
    assert.equal(isAdditionalContactRelationship(r), false)
  }
  assert.ok(ADDITIONAL_CONTACT_RELATIONSHIPS.includes('spouse'))
  assert.ok(isAdditionalContactRelationship('trustee'))
})

test('unscoped contacts show on every project; scoped ones only where linked', () => {
  assert.equal(isContactVisibleOnProject([], 'p1'), true)
  assert.equal(isContactVisibleOnProject(['p1'], 'p1'), true)
  assert.equal(isContactVisibleOnProject(['p2'], 'p1'), false)
})

test('duplicate detection matches email case-insensitively and phones across fields', () => {
  const byEmail = findPossibleDuplicates({ ...base, first_name: 'J', last_name: 'X', email: ' jane@example.com ' }, existing)
  assert.deepEqual(byEmail.map((m) => [m.contact.id, m.reasons]), [['a', ['email']]])
  const byPhone = findPossibleDuplicates({ ...base, first_name: 'Q', last_name: 'R', phone: '555-999-0000' }, existing)
  assert.deepEqual(byPhone.map((m) => m.contact.id), ['b'])
  const byName = findPossibleDuplicates({ ...base, first_name: 'sam', last_name: 'LEE' }, existing)
  assert.deepEqual(byName[0].reasons, ['name'])
  assert.equal(findPossibleDuplicates({ ...base, first_name: 'New', last_name: 'Person' }, existing).length, 0)
})

test('portal status never implies access the account does not have', () => {
  assert.equal(derivePortalStatus(null, null, 'p1'), 'not_provisioned')
  const member = { status: 'active', activation_required: false }
  assert.equal(derivePortalStatus({ projectIds: ['p1'] }, member, 'p1'), 'active')
  assert.equal(derivePortalStatus({ projectIds: ['p2'] }, member, 'p1'), 'no_project_access')
  assert.equal(derivePortalStatus({ projectIds: ['p1'] }, { status: 'active', activation_required: true }, 'p1'), 'pending')
  assert.equal(derivePortalStatus({ projectIds: ['p1'] }, { status: 'suspended', activation_required: false }, 'p1'), 'suspended')
})
