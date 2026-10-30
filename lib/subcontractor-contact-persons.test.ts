import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contactFieldKey,
  findPossibleExistingPeople,
  matchesContactSearch,
  parseContactPersons,
  planCurrentContactChanges,
  type ContactPersonOption,
} from './subcontractor-contact-persons.ts'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const R = '33333333-3333-4333-8333-333333333333'

const person: ContactPersonOption = {
  id: A,
  first_name: 'Maria',
  last_name: 'Lopez',
  email: 'maria@acme.com',
  primary_phone: '(555) 201-3344',
  secondary_phone: null,
  companies: [],
}

test('empty section is valid', () => {
  assert.deepEqual(parseContactPersons(''), { ok: true, items: [] })
})

test('existing and new contacts parse with roles', () => {
  const res = parseContactPersons(
    JSON.stringify([
      { key: 'a1', kind: 'existing', person_id: A, role: 'Foreman', is_primary: true },
      { key: 'n1', kind: 'new', role: 'Estimator', is_primary: false, first_name: 'Ted', last_name: 'Ng', email: '', primary_phone: '', secondary_phone: '' },
    ]),
  )
  assert.equal(res.ok, true)
  if (res.ok) assert.deepEqual(res.items.map((i) => i.kind), ['existing', 'new'])
})

test('rejects unknown roles, duplicate people, missing names, and two primaries', () => {
  const res = parseContactPersons(
    JSON.stringify([
      { key: 'a1', kind: 'existing', person_id: A, role: 'Wizard', is_primary: false },
      { key: 'a2', kind: 'existing', person_id: A, role: '', is_primary: false },
      { key: 'n1', kind: 'new', role: '', is_primary: false, first_name: '', last_name: 'Ng', email: '', primary_phone: '', secondary_phone: '' },
    ]),
  )
  assert.equal(res.ok, false)
  if (!res.ok) {
    assert.ok(res.fieldErrors[contactFieldKey('a1', 'role')])
    assert.ok(res.fieldErrors[contactFieldKey('a2', 'person_id')])
    assert.ok(res.fieldErrors[contactFieldKey('n1', 'first_name')])
  }
  const two = parseContactPersons(
    JSON.stringify([
      { key: 'a1', kind: 'existing', person_id: A, role: '', is_primary: true },
      { key: 'b1', kind: 'existing', person_id: B, role: '', is_primary: true },
    ]),
  )
  assert.equal(two.ok, false)
})

test('a removed current contact does not count as primary', () => {
  const res = parseContactPersons(
    JSON.stringify([
      { key: 'c1', kind: 'current', relationship_id: R, person_id: A, role: 'Owner', is_primary: true, remove: true },
      { key: 'b1', kind: 'existing', person_id: B, role: '', is_primary: true },
    ]),
  )
  assert.equal(res.ok, true)
})

test('tampered payloads are rejected', () => {
  assert.equal(parseContactPersons('{not json').ok, false)
  assert.equal(parseContactPersons(JSON.stringify([{ key: 'x', kind: 'admin' }])).ok, false)
})

test('search matches names, email, and phone digits', () => {
  assert.ok(matchesContactSearch(person, 'lopez maria'))
  assert.ok(matchesContactSearch(person, 'ACME'))
  assert.ok(matchesContactSearch(person, '201-33'))
  assert.equal(matchesContactSearch(person, 'zzz'), false)
})

test('new entries flag likely existing people', () => {
  const base = { first_name: '', last_name: '', email: '', primary_phone: '', secondary_phone: '' }
  assert.equal(findPossibleExistingPeople({ ...base, email: 'MARIA@acme.com' }, [person]).length, 1)
  assert.equal(findPossibleExistingPeople({ ...base, primary_phone: '555.201.3344' }, [person]).length, 1)
  assert.equal(findPossibleExistingPeople({ ...base, first_name: 'Maria', last_name: 'Lopez' }, [person]).length, 1)
  assert.equal(findPossibleExistingPeople({ ...base, first_name: 'Maria', last_name: 'Smith' }, [person]).length, 0)
})

test('primary is cleared before a new one is set', () => {
  const R2 = '44444444-4444-4444-8444-444444444444'
  const plan = planCurrentContactChanges(
    [
      { relationship_id: R, role: null, is_primary: false },
      { relationship_id: R2, role: null, is_primary: true },
    ],
    [
      { kind: 'current', relationship_id: R, person_id: A, role: null, is_primary: true, remove: false },
      { kind: 'current', relationship_id: R2, person_id: B, role: null, is_primary: false, remove: false },
    ],
  )
  assert.deepEqual(plan.update.map((u) => u.relationship_id), [R2, R])
})
