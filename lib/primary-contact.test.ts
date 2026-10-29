import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPrimaryContact } from './primary-contact.ts'

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
