import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  getConstructionMarketIntelligence,
  isAllowedSourceUrl,
  resolveLocation,
  summarizeMarket,
  type MarketDeps,
} from './market-data.ts'
import { parseBpsFile, parseQcewCsv, bpsCandidateMonths, qcewCandidateQuarters } from './market-providers.ts'
import type { FetchLike } from './market-http.ts'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/market/${name}`, import.meta.url), 'utf8')
const TODAY = '2026-10-29'

const respond = (status: number, body: string) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body), text: async () => body }) as Awaited<ReturnType<FetchLike>>

type Overrides = { tiger?: 'ok' | 'down'; bps?: 'ok' | 'rejected' }

/** Routes each official URL to the response recorded from that service. */
function recordedFetch(o: Overrides = {}) {
  const calls: string[] = []
  const fetchImpl: FetchLike = async (url) => {
    calls.push(url)
    if (url.includes('tigerweb.geo.census.gov')) {
      if (o.tiger === 'down') return respond(502, 'Bad Gateway')
      if (url.includes('/28/query')) return respond(200, fixture('tiger-place.json'))
      if (url.includes('/82/query')) return respond(200, fixture('tiger-county.json'))
      if (url.includes('/93/query')) return respond(200, fixture('tiger-metro.json'))
      return respond(200, '{"features":[]}')
    }
    if (url.startsWith('https://api.bls.gov/')) return respond(200, fixture('bls.json'))
    if (url.startsWith('https://data.bls.gov/cew/')) return url.includes('/2026/1/area/48113') ? respond(200, fixture('qcew-48113-2026-1.csv')) : respond(404, '')
    if (url.startsWith('https://www2.census.gov/econ/bps/')) {
      if (o.bps === 'rejected') return respond(200, fixture('bps-rejected.html'))
      const m = url.match(/\/(co|so)(\d{4})c\.txt$/)
      if (m && ['2609', '2509'].includes(m[2])) return respond(200, fixture(`bps-${m[1]}${m[2]}c.txt`))
      return respond(404, '')
    }
    throw new Error(`unexpected URL ${url}`)
  }
  return { fetchImpl, calls }
}

const deps = (fetchImpl: FetchLike, extra: Partial<MarketDeps> = {}): MarketDeps => ({ fetchImpl, today: TODAY, cache: null, timeoutMs: 2_000, deadlineMs: 5_000, ...extra })

test('source allowlist accepts only official dataset URLs', () => {
  assert.ok(isAllowedSourceUrl('https://data.bls.gov/timeseries/CES2000000001'))
  assert.ok(isAllowedSourceUrl('https://data.bls.gov/cew/data/api/2026/1/area/48113.csv'))
  assert.ok(isAllowedSourceUrl('https://www2.census.gov/econ/bps/Place/South%20Region/so2609c.txt'))
  assert.ok(isAllowedSourceUrl('https://fred.stlouisfed.org/series/HOUST'))
  assert.ok(!isAllowedSourceUrl('https://example.com/series/HOUST'))
  assert.ok(!isAllowedSourceUrl('javascript:alert(1)'))
  assert.ok(!isAllowedSourceUrl('https://data.bls.gov/timeseries/CES2000000001?x=1'))
})

test('resolveLocation splits city and state without a city list', () => {
  const r = resolveLocation('Cedar Hill, TX')
  assert.equal(r.city, 'Cedar Hill')
  assert.equal(r.stateCode, 'TX')
  assert.equal(r.source, 'request')
  assert.equal(resolveLocation('Texas').city, null)
  assert.equal(resolveLocation('Texas').stateCode, 'TX')
})

test('release calendars pick the newest plausible period', () => {
  assert.deepEqual(bpsCandidateMonths(TODAY), ['2609', '2608', '2607'])
  assert.deepEqual(qcewCandidateQuarters(TODAY)[0], { year: 2026, quarter: 2 })
})

test('parseBpsFile matches the Texas place, not a same-named place in another state', () => {
  const counts = parseBpsFile(fixture('bps-so2609c.txt'), { kind: 'place', region: 'South' }, { stateFips: '48', place: '13492' })
  assert.deepEqual(counts, { singleFamilyUnits: 2, totalUnits: 2 })
  assert.equal(parseBpsFile(fixture('bps-rejected.html'), { kind: 'place', region: 'South' }, { stateFips: '48', place: '13492' }), null)
})

test('parseQcewCsv reads private construction for the county', () => {
  const q = parseQcewCsv(fixture('qcew-48113-2026-1.csv'), '48113')
  assert.ok(q)
  assert.ok(q.employment !== null && q.employment > 0)
  assert.equal(q.avgWeeklyWage, 1949)
  assert.equal(parseQcewCsv('not,a,csv', '48113'), null)
})

test('Cedar Hill resolves to Dallas County and DFW and returns local-first official data', async () => {
  const { fetchImpl } = recordedFetch()
  const r = await getConstructionMarketIntelligence({ topics: ['building_permits', 'labor', 'materials', 'interest_rates'], location: 'Cedar Hill, TX' }, deps(fetchImpl))
  assert.equal(r.geography.resolution, 'resolved')
  assert.match(r.geography.county ?? '', /Dallas/)
  assert.equal(r.geography.metro_code, '19100')
  assert.equal(r.geography.best_data_level, 'place')

  const ids = r.series.map((s) => s.series_id)
  assert.ok(ids.includes('BPS-place-single'), 'city permits')
  assert.ok(ids.some((id) => id.startsWith('QCEW-48113')), 'county employment')
  assert.ok(ids.includes('SMU48191001500000001'), 'metro falls back to mining, logging, and construction')
  assert.ok(!ids.includes('SMU48191002000000001'))
  assert.ok(ids.includes('WPUSI012011'))
  for (const s of r.series) assert.ok(isAllowedSourceUrl(s.source_url), `${s.series_id} cites ${s.source_url}`)

  const fredGaps = r.data_gaps.filter((g) => g.reason === 'source_not_connected')
  assert.ok(fredGaps.some((g) => /mortgage/i.test(g.indicator)), 'unconnected FRED reported as a gap, not invented')
  assert.equal(r.data_gaps.filter((g) => g.indicator.startsWith('Construction employment (Dallas')).length, 0, 'a loaded fallback series closes its alternative group')

  const summary = summarizeMarket(r)
  assert.equal(summary.coverage[0], 'City')
  assert.equal(summary.indicators[0].geography, 'Cedar Hill, TX')
})

test('a throttled Census file is a gap; BLS data still returns', async () => {
  const { fetchImpl } = recordedFetch({ bps: 'rejected' })
  const r = await getConstructionMarketIntelligence({ topics: ['building_permits', 'labor'], location: 'Cedar Hill, TX' }, deps(fetchImpl))
  assert.ok(!r.series.some((s) => s.series_id.startsWith('BPS-')))
  assert.ok(r.data_gaps.some((g) => g.reason === 'source_unavailable' && /permit/i.test(g.indicator)))
  assert.ok(r.series.some((s) => s.series_id === 'CES2000000001'))
  assert.equal(r.providers.find((p) => p.provider === 'census_bps')?.status, 'failed')
})

test('geography outage falls back to state and national data with an explicit gap', async () => {
  const { fetchImpl } = recordedFetch({ tiger: 'down' })
  const r = await getConstructionMarketIntelligence({ topics: ['labor'], location: 'Cedar Hill, TX' }, deps(fetchImpl))
  assert.equal(r.geography.resolution, 'lookup_failed')
  assert.ok(r.series.some((s) => s.geography_level === 'state'))
  assert.ok(!r.series.some((s) => s.geography_level === 'county' || s.geography_level === 'metro'))
  assert.ok(r.data_gaps.some((g) => g.reason === 'location_not_resolved'))
})

test('FRED key never leaks into diagnostics', async () => {
  const fetchImpl: FetchLike = async (url) => {
    if (url.startsWith('https://api.stlouisfed.org/')) throw new Error(`network error for ${url}`)
    return recordedFetch().fetchImpl(url)
  }
  const r = await getConstructionMarketIntelligence({ topics: ['interest_rates'], location: 'Texas' }, deps(fetchImpl, { fredApiKey: 'secret-key-123' }))
  assert.ok(!JSON.stringify(r).includes('secret-key-123'))
  assert.ok(r.data_gaps.some((g) => g.reason === 'source_unavailable'))
})
