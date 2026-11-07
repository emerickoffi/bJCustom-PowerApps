import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalCityLabels, formatLocation, normalizeStateLabel } from './location-display.ts'

test('recognized US states become postal abbreviations', () => {
  assert.equal(normalizeStateLabel('Texas'), 'TX')
  assert.equal(normalizeStateLabel(' tx '), 'TX')
  assert.equal(normalizeStateLabel('new  york'), 'NY')
  assert.equal(normalizeStateLabel('D.C.'), 'DC')
})

test('unfamiliar or international regions are kept as entered', () => {
  assert.equal(normalizeStateLabel('Ontario'), 'Ontario')
  assert.equal(normalizeStateLabel('QC'), 'QC')
  assert.equal(normalizeStateLabel(''), '')
  assert.equal(formatLocation('Toronto', 'Ontario'), 'Toronto, Ontario')
})

test('city labels use the most common stored spelling without title-casing', () => {
  const labels = canonicalCityLabels([
    { city: 'austin', state: 'Texas' },
    { city: 'Austin', state: 'TX' },
    { city: 'Austin', state: 'tx' },
    { city: 'mcallen', state: 'TX' },
  ])
  assert.equal(formatLocation('AUSTIN', 'texas', labels), 'Austin, TX')
  assert.equal(formatLocation('mcallen', 'TX', labels), 'mcallen, TX')
})

test('mixed case wins a tie between spellings', () => {
  const labels = canonicalCityLabels([
    { city: 'SAN ANTONIO', state: 'TX' },
    { city: 'San Antonio', state: 'TX' },
  ])
  assert.equal(formatLocation('san antonio', 'TX', labels), 'San Antonio, TX')
})

test('missing parts are omitted', () => {
  assert.equal(formatLocation(null, 'TX'), 'TX')
  assert.equal(formatLocation('Austin', null), 'Austin')
  assert.equal(formatLocation(null, null), '')
})
