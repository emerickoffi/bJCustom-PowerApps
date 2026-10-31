import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPrimaryContact, isSamePerson, shouldShowClientAsPrimary } from './primary-contact.ts'

test('copies the client identity into a primary owner contact', () => {
  const c = buildPrimaryContact({
    first_name: ' Andy ',
    middle_name: '',
    last_name: 'Belle',
    email: ' Andy@Example.COM ',
    phone: '555-0100',
    alternate_phone: '  ',
    preferred_communication: 'phone',
  })
  assert.equal(c.first_name, 'Andy')
  assert.equal(c.middle_name, null)
  assert.equal(c.email, 'andy@example.com')
  assert.equal(c.alternate_phone, null)
  assert.equal(c.preferred_communication, 'phone')
  assert.equal(c.relationship, 'primary_owner')
  assert.equal(c.is_primary, true)
})

test('portal flags match existing primary contacts so linking never locks a homeowner out', () => {
  const c = buildPrimaryContact({ first_name: 'John', last_name: 'Doe' })
  assert.deepEqual(
    [c.portal_enabled, c.portal_view_reports, c.portal_validate_issues, c.portal_acknowledge, c.portal_sign],
    [true, true, true, true, true],
  )
  assert.equal(c.email, null)
  assert.equal(c.preferred_communication, 'email')
})

const andy = { first_name: 'Andy', last_name: 'Belle', email: 'andy@example.com' }

test('matches the same person by email or by full name, case-insensitively', () => {
  assert.equal(isSamePerson(andy, { first_name: 'A.', last_name: 'B', email: ' ANDY@example.com ' }), true)
  assert.equal(isSamePerson(andy, { first_name: ' andy', last_name: 'BELLE', email: null }), true)
  assert.equal(isSamePerson(andy, { first_name: 'Sarah', last_name: 'Belle', email: 'sarah@example.com' }), false)
  assert.equal(isSamePerson({ ...andy, email: null }, { first_name: 'Sarah', last_name: 'Belle', email: null }), false)
})

test('shows the client as primary only when no primary row or duplicate person exists', () => {
  assert.equal(shouldShowClientAsPrimary(andy, []), true)
  const spouse = { first_name: 'Sarah', last_name: 'Belle', email: 'sarah@example.com', is_primary: false }
  assert.equal(shouldShowClientAsPrimary(andy, [spouse]), true)
  assert.equal(shouldShowClientAsPrimary(andy, [{ ...andy, is_primary: true }]), false)
  assert.equal(shouldShowClientAsPrimary(andy, [{ ...andy, is_primary: false }]), false)
})
