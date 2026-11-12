import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FAILED_RETRY_MS,
  addressKey,
  directionsUrl,
  geocodeQuery,
  needsGeocode,
  parseLocationIds,
  siteAddressLine,
  toProjectLocation,
  type StoredLocation,
} from './project-locations.ts'

const site = { address_line1: '120  Oak St', city: 'Austin', state: 'TX', postal_code: '78701' }
const ID = '00000000-0000-4000-8000-000000000001'

test('geocodeQuery requires a street plus city/state or ZIP', () => {
  assert.deepEqual(geocodeQuery(site), { ok: true, query: '120 Oak St, Austin, TX 78701' })
  assert.deepEqual(geocodeQuery({ ...site, postal_code: null }), { ok: true, query: '120 Oak St, Austin, TX' })
  assert.deepEqual(geocodeQuery({ ...site, city: null, state: null }), { ok: true, query: '120 Oak St, 78701' })
  assert.deepEqual(geocodeQuery({ ...site, address_line1: '' }), { ok: false, reason: 'no_address' })
  assert.deepEqual(geocodeQuery({ ...site, state: null, postal_code: null }), { ok: false, reason: 'no_address' })
  assert.deepEqual(geocodeQuery({ ...site, country: 'Canada' }), { ok: false, reason: 'unsupported' })
  assert.equal(geocodeQuery({ ...site, country: 'USA' }).ok, true)
})

test('addressKey ignores case, spacing, and punctuation', () => {
  assert.equal(addressKey('120 Oak St., Austin, TX 78701'), addressKey('120  oak st austin tx 78701'))
  assert.notEqual(addressKey('120 Oak St, Austin, TX'), addressKey('122 Oak St, Austin, TX'))
})

test('needsGeocode only for new or changed addresses, and stale failures', () => {
  const key = addressKey('120 Oak St, Austin, TX 78701')
  const now = Date.parse('2026-11-12T12:00:00Z')
  const row = (status: StoredLocation['status'], at = '2026-11-12T11:59:00Z'): StoredLocation => ({
    address_key: key,
    status,
    latitude: status === 'ok' ? 30 : null,
    longitude: status === 'ok' ? -97 : null,
    geocoded_at: at,
  })
  assert.equal(needsGeocode(null, key, now), true)
  assert.equal(needsGeocode(row('ok'), key, now), false)
  assert.equal(needsGeocode(row('unresolved'), key, now), false)
  assert.equal(needsGeocode(row('ok'), addressKey('9 Elm St, Austin, TX'), now), true)
  assert.equal(needsGeocode(row('failed'), key, now), false)
  assert.equal(needsGeocode(row('failed', new Date(now - FAILED_RETRY_MS).toISOString()), key, now), true)
})

test('toProjectLocation never invents a pin', () => {
  const key = addressKey('120 Oak St, Austin, TX 78701')
  const ok: StoredLocation = { address_key: key, status: 'ok', latitude: 30.27, longitude: -97.74, geocoded_at: '' }
  assert.deepEqual(toProjectLocation(ID, site, ok), {
    projectId: ID,
    state: 'ok',
    lat: 30.27,
    lng: -97.74,
    address: '120 Oak St, Austin, TX 78701',
  })
  assert.equal(toProjectLocation(ID, { ...site, address_line1: null }, ok).state, 'unavailable')
  const moved = toProjectLocation(ID, { ...site, address_line1: '9 Elm St' }, ok)
  assert.equal(moved.state === 'unavailable' && moved.reason, 'pending')
  const missed = toProjectLocation(ID, site, { ...ok, status: 'ambiguous', latitude: null, longitude: null })
  assert.equal(missed.state === 'unavailable' && missed.reason, 'ambiguous')
})

test('siteAddressLine and directionsUrl', () => {
  assert.equal(siteAddressLine({ ...site, address_line2: 'Unit 4' }), '120 Oak St Unit 4, Austin, TX 78701')
  assert.equal(siteAddressLine({ address_line1: null, city: null, state: null, postal_code: null }), null)
  assert.equal(directionsUrl({ lat: 30.27, lng: -97.74 }), 'https://www.google.com/maps/dir/?api=1&destination=30.27%2C-97.74')
  assert.match(directionsUrl({ address: '120 Oak St, Austin' }), /destination=120%20Oak%20St%2C%20Austin$/)
})

test('parseLocationIds accepts only a bounded list of UUIDs', () => {
  assert.deepEqual(parseLocationIds([ID, ID]), [ID])
  assert.equal(parseLocationIds(['nope']), null)
  assert.equal(parseLocationIds('x'), null)
  assert.equal(parseLocationIds(Array.from({ length: 51 }, () => ID)), null)
})
