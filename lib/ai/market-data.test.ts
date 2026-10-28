import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getConstructionMarketIntelligence,
  isAllowedSourceUrl,
  isStale,
  parseObservations,
  resolveLocation,
  seriesFor,
} from './market-data.ts'

const today = '2026-10-28'

const okFetch = (urls: string[]) => async (url: string) => {
  urls.push(url)
  if (url.includes('/series/observations')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        observations: [
          { date: '2026-09-01', value: '1450' },
          { date: '2026-08-01', value: '.' },
          { date: '2026-07-01', value: '1400' },
          { date: '2025-09-01', value: '1300' },
        ],
      }),
    }
  }
  return { ok: true, status: 200, json: async () => ({ seriess: [{ last_updated: '2026-10-17 07:51:02-05' }] }) }
}

test('resolveLocation maps cities and states, and flags city substitution', () => {
  assert.equal(resolveLocation('Texas').stateCode, 'TX')
  assert.equal(resolveLocation('TX').stateCode, 'TX')
  const dallas = resolveLocation('Dallas, TX')
  assert.equal(dallas.stateCode, 'TX')
  assert.match(dallas.note ?? '', /statewide/)
  assert.equal(resolveLocation(null).stateCode, null)
  assert.match(resolveLocation('Atlantis').note ?? '', /national/)
})

test('seriesFor only produces allowlisted ids', () => {
  for (const s of seriesFor('building_permits', 'TX')) assert.match(s.id, /^[A-Z0-9]{3,20}$/)
  assert.equal(seriesFor('building_permits', 'TX')[0].id, 'TXBPPRIVSA')
  assert.deepEqual(seriesFor('construction_news', null), [])
})

test('parseObservations skips missing values and invalid rows', () => {
  const rows = parseObservations({ observations: [{ date: '2026-01-01', value: '.' }, { date: 'bad', value: '1' }, { date: '2026-02-01', value: '5' }] })
  assert.deepEqual(rows, [{ date: '2026-02-01', value: 5 }])
  assert.equal(parseObservations({ nope: 1 }), null)
})

test('staleness by frequency', () => {
  assert.equal(isStale('2026-09-01', 'monthly', today), false)
  assert.equal(isStale('2026-05-01', 'monthly', today), true)
  assert.equal(isStale('2026-10-01', 'weekly', today), true)
})

test('source URLs must be FRED series pages', () => {
  assert.equal(isAllowedSourceUrl('https://fred.stlouisfed.org/series/HOUST'), true)
  assert.equal(isAllowedSourceUrl('https://evil.example/series/HOUST'), false)
  assert.equal(isAllowedSourceUrl('https://fred.stlouisfed.org/series/HOUST?x=<script>'), false)
})

test('no API key returns unavailable without fetching', async () => {
  let called = false
  const r = await getConstructionMarketIntelligence({ topic: 'housing_activity' }, {
    apiKey: '',
    today,
    fetchImpl: async () => {
      called = true
      throw new Error('should not fetch')
    },
  })
  assert.equal(r.status, 'unavailable')
  assert.equal(called, false)
})

test('news is reported unavailable instead of invented', async () => {
  const r = await getConstructionMarketIntelligence({ topic: 'construction_news' }, { apiKey: 'k', today, fetchImpl: okFetch([]) })
  assert.equal(r.status, 'unavailable')
  assert.equal(r.series.length, 0)
})

test('successful fetch returns periods, comparison, and source links on the fixed host', async () => {
  const urls: string[] = []
  const r = await getConstructionMarketIntelligence({ topic: 'building_permits', location: 'Texas', timeframe: 'last_12_months' }, { apiKey: 'k', today, fetchImpl: okFetch(urls) })
  assert.equal(r.status, 'ok')
  assert.ok(urls.every((u) => u.startsWith('https://api.stlouisfed.org/fred/')))
  const first = r.series[0]
  assert.equal(first.observation_period, '2026-09-01')
  assert.equal(first.latest_value, 1450)
  assert.equal(first.source_last_updated, '2026-10-17')
  assert.equal(first.stale, false)
  assert.ok(isAllowedSourceUrl(first.source_url))
})

test('provider failures produce partial or unavailable, never fabricated values', async () => {
  let n = 0
  const flaky = async (url: string) => {
    if (url.includes('/series/observations') && n++ === 0) return { ok: false, status: 500, json: async () => ({}) }
    return okFetch([])(url)
  }
  const partial = await getConstructionMarketIntelligence({ topic: 'building_permits', location: 'TX' }, { apiKey: 'k', today, fetchImpl: flaky })
  assert.equal(partial.status, 'partial')
  assert.ok(partial.unavailable.length >= 1)

  const down = await getConstructionMarketIntelligence({ topic: 'interest_rates' }, {
    apiKey: 'k',
    today,
    fetchImpl: async () => {
      throw new Error('timeout')
    },
  })
  assert.equal(down.status, 'unavailable')
  assert.equal(down.series.length, 0)
})
