import { test } from 'node:test'
import assert from 'node:assert/strict'
import { US_STATE_OPTIONS, isUsCountry, matchesUsState, normalizeUsState, optionalUsState, requiredUsState } from './us-states.ts'

test('includes all 50 states plus DC', () => {
  assert.equal(US_STATE_OPTIONS.length, 51)
  assert.ok(US_STATE_OPTIONS.some((o) => o.value === 'DC'))
})

test('normalizes names and abbreviations to codes', () => {
  assert.equal(normalizeUsState('ga'), 'GA')
  assert.equal(normalizeUsState(' Georgia '), 'GA')
  assert.equal(normalizeUsState('new  york'), 'NY')
  assert.equal(normalizeUsState('Washington, D.C.'.replace(',', '')), 'DC')
  assert.equal(normalizeUsState('Washington'), 'WA')
  assert.equal(normalizeUsState('Ontario'), null)
  assert.equal(normalizeUsState(''), null)
})

test('search matches name substrings and abbreviation prefixes', () => {
  const ga = US_STATE_OPTIONS.find((o) => o.value === 'GA')!
  assert.ok(matchesUsState(ga, 'geor'))
  assert.ok(matchesUsState(ga, 'GA'))
  assert.ok(!matchesUsState(ga, 'tex'))
})

test('treats blank and US variants as U.S.', () => {
  for (const c of ['', null, 'US', 'U.S.', 'USA', 'United States']) assert.ok(isUsCountry(c))
  assert.ok(!isUsCountry('Canada'))
})

test('schemas normalize valid states and reject unknown values', () => {
  assert.equal(optionalUsState.parse(''), null)
  assert.equal(optionalUsState.parse('texas'), 'TX')
  assert.equal(optionalUsState.safeParse('Narnia').success, false)
  assert.equal(requiredUsState.parse('ca'), 'CA')
  assert.equal(requiredUsState.safeParse('').success, false)
})
