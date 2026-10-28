import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BRIEFING_TOPICS,
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

const company = { city: 'Cedar Hill', state: 'TX' }

test('resolveLocation splits city and state without a city list', () => {
  for (const [input, city] of [
    ['Cedar Hill, TX', 'Cedar Hill'],
    ['cedar hill texas', 'Cedar Hill'],
    ['Arlington, Texas', 'Arlington'],
    ['Dallas TX', 'Dallas'],
  ] as const) {
    const r = resolveLocation(input)
    assert.equal(r.stateCode, 'TX', input)
    assert.equal(r.city, city, input)
    assert.equal(r.dataLevel, 'state')
    assert.match(r.note ?? '', /statewide/)
  }
  assert.equal(resolveLocation('Texas').city, null)
  assert.equal(resolveLocation('TX').stateCode, 'TX')
})

test('"our area" and a bare matching city use the company address', () => {
  for (const input of [null, '', 'our area', 'local', 'Cedar Hill']) {
    const r = resolveLocation(input, company)
    assert.equal(r.stateCode, 'TX', String(input))
    assert.equal(r.label, 'Cedar Hill, Texas')
  }
})

test('explicit locations win over the company address and nothing is mislabeled', () => {
  assert.equal(resolveLocation('Oklahoma', company).stateCode, 'OK')
  assert.equal(resolveLocation('Tulsa, OK', company).label, 'Tulsa, Oklahoma')
  const unknown = resolveLocation('Springfield', company)
  assert.equal(unknown.stateCode, null)
  assert.equal(unknown.dataLevel, 'national')
  assert.match(unknown.note ?? '', /state .* not given/)
  assert.equal(resolveLocation('nationwide', company).stateCode, null)
  assert.match(resolveLocation(null).note ?? '', /No company or project location/)
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

test('no API key returns a clean not-configured status without fetching', async () => {
  let called = false
  const r = await getConstructionMarketIntelligence({ topics: BRIEFING_TOPICS }, {
    apiKey: '',
    today,
    fetchImpl: async () => {
      called = true
      throw new Error('should not fetch')
    },
  }, company)
  assert.equal(r.status, 'unavailable')
  assert.equal(r.configuration, 'not_configured')
  assert.equal(called, false)
  assert.equal(r.categories.length, BRIEFING_TOPICS.length)
  assert.ok(r.notes.every((n) => !/FRED_API_KEY|api[_ ]key|env/i.test(n)))
  assert.equal(r.geography.location, 'Cedar Hill, Texas')
})

test('news is reported unavailable instead of invented', async () => {
  const r = await getConstructionMarketIntelligence({ topics: ['construction_news'] }, { apiKey: 'k', today, fetchImpl: okFetch([]) })
  assert.equal(r.status, 'unavailable')
  assert.equal(r.configuration, null)
  assert.equal(r.series.length, 0)
})

test('a full briefing is one bounded operation with shared series fetched once', async () => {
  const urls: string[] = []
  let active = 0
  let peak = 0
  const counting = async (url: string) => {
    active++
    peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 5))
    active--
    return okFetch(urls)(url)
  }
  const r = await getConstructionMarketIntelligence({ topics: BRIEFING_TOPICS, location: 'Cedar Hill, TX' }, { apiKey: 'k', today, fetchImpl: counting })
  assert.equal(r.status, 'ok')
  const observed = urls.filter((u) => u.includes('/series/observations')).map((u) => new URL(u).searchParams.get('series_id'))
  assert.equal(new Set(observed).size, observed.length, 'no series fetched twice')
  assert.ok(observed.length <= 8)
  assert.ok(peak <= 8, `peak concurrency ${peak}`)
  assert.ok(r.categories.every((c) => c.status === 'ok' && c.series_ids.length > 0))
  assert.equal(r.series.find((s) => s.series_id === 'TXBPPRIVSA')?.geography, 'state: Texas')
  assert.ok(r.series.filter((s) => s.series_id !== 'TXBPPRIVSA').every((s) => s.geography === 'national'))
})

test('successful fetch returns periods, comparison, and source links on the fixed host', async () => {
  const urls: string[] = []
  const r = await getConstructionMarketIntelligence({ topics: ['building_permits'], location: 'Texas', timeframe: 'last_12_months' }, { apiKey: 'k', today, fetchImpl: okFetch(urls) })
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
  const partial = await getConstructionMarketIntelligence({ topics: ['building_permits', 'interest_rates'], location: 'TX' }, { apiKey: 'k', today, fetchImpl: flaky })
  assert.equal(partial.status, 'partial')
  assert.ok(partial.unavailable.length >= 1)
  assert.equal(partial.categories.find((c) => c.topic === 'interest_rates')?.status, 'ok')

  const down = await getConstructionMarketIntelligence({ topics: ['interest_rates'] }, {
    apiKey: 'k',
    today,
    fetchImpl: async () => {
      throw new Error('timeout')
    },
  })
  assert.equal(down.status, 'unavailable')
  assert.equal(down.series.length, 0)
})
