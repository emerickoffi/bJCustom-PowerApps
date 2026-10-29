/**
 * Construction market intelligence from official public sources, most local level first:
 * Census Building Permits Survey (city and county permits), BLS QCEW (county construction jobs and wages),
 * BLS CES/SM (metro, state, and U.S. construction employment), BLS PPI (national materials prices), and,
 * when configured, FRED (housing starts, mortgage rates, seasonally adjusted permit totals).
 * Each value carries its own geography so a national figure is never presented as local.
 */
import {
  censusRegion,
  resolveLocation,
  resolvePlaceGeography,
  STATE_FIPS,
  US_STATES,
  type KnownPlace,
  type PlaceGeography,
} from './market-geography.ts'
import type { FetchLike, MarketCache } from './market-http.ts'
import {
  blsSeriesUrl,
  fredSeriesUrl,
  loadBlsSeries,
  loadBpsPermits,
  loadFredSeries,
  loadQcewCounty,
  type PermitObservation,
  type Point,
  type QcewCounty,
} from './market-providers.ts'

export { isAllowedSourceUrl } from './market-source-urls.ts'
export { resolveLocation, US_STATES, type KnownPlace } from './market-geography.ts'

export const MARKET_TOPICS = ['housing_activity', 'building_permits', 'materials', 'labor', 'interest_rates', 'construction_news'] as const
export type MarketTopic = (typeof MARKET_TOPICS)[number]

export const MARKET_TIMEFRAMES = ['latest', 'last_3_months', 'last_12_months'] as const
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number]

/** Every indicator category, used when the user asks for a general market briefing. */
export const BRIEFING_TOPICS: MarketTopic[] = ['housing_activity', 'building_permits', 'materials', 'labor', 'interest_rates']

type Frequency = 'weekly' | 'monthly' | 'quarterly'
export type GeoLevel = 'place' | 'county' | 'metro' | 'state' | 'national'
type Format = 'count' | 'jobs' | 'jobs_thousands' | 'usd' | 'usd_cents' | 'index' | 'percent' | 'thousands_saar'
type Provider = 'census_geography' | 'bls' | 'qcew' | 'census_bps' | 'fred'

type Def = {
  id: string
  title: string
  topics: MarketTopic[]
  units: string
  format: Format
  level: GeoLevel
  geography: string
  source: string
  provider: Provider
  frequency: Frequency
  seasonally_adjusted: boolean
  /** Strongly seasonal and not adjusted: only a same-period-last-year comparison is meaningful. */
  yearOverYearOnly: boolean
  /** Alternatives sharing a group fill one slot; the first one published wins. */
  group?: string
}

export type MarketSeriesResult = {
  series_id: string
  title: string
  topics: MarketTopic[]
  units: string
  geography_level: GeoLevel
  geography: string
  source: string
  source_url: string
  frequency: Frequency
  seasonally_adjusted: boolean
  /** The economic reference period of the latest value, not a publication date. */
  observation_period: string
  period_label: string
  latest_value: number
  value_text: string
  preliminary: boolean
  comparison: {
    observation_period: string
    period_label: string
    value: number
    change: number
    change_percent: number | null
    basis: string
  } | null
  stale: boolean
}

export type GapReason = 'source_not_connected' | 'not_published_for_geography' | 'suppressed' | 'source_unavailable' | 'location_not_resolved' | 'no_provider'
export type DataGap = { topic: MarketTopic | 'location'; indicator: string; reason: GapReason; detail: string }

type Status = 'ok' | 'partial' | 'unavailable'
export type ProviderStatus = { provider: Provider; status: 'ok' | 'failed' | 'skipped'; detail: string | null }

export type MarketIntelligence = {
  status: Status
  topics: MarketTopic[]
  timeframe: MarketTimeframe
  geography: {
    requested: string | null
    location: string
    location_source: 'request' | 'project' | 'company' | 'none'
    city: string | null
    county: string | null
    county_fips: string | null
    metro: string | null
    metro_code: string | null
    state: string | null
    resolution: 'resolved' | 'not_found' | 'ambiguous' | 'lookup_failed' | 'state_only' | 'national'
    /** Most specific level any returned series covers. */
    best_data_level: GeoLevel
    note: string | null
  }
  categories: { topic: MarketTopic; status: Status; series_ids: string[] }[]
  series: MarketSeriesResult[]
  data_gaps: DataGap[]
  notes: string[]
  retrieved_at: string
  /** Server-side diagnostics; strip before sending to the model or the browser. */
  providers: ProviderStatus[]
}

export type MarketDeps = {
  fetchImpl: FetchLike
  today: string
  fredApiKey?: string | null
  blsApiKey?: string | null
  timeoutMs?: number
  /** Overall budget for one call; slower providers are reported as unavailable. */
  deadlineMs?: number
  cache?: MarketCache | null
}

export const MARKET_NOTES = [
  'Economic indicators are aggregate statistics, not supplier quotes or bids. Do not present them as local material prices.',
]

const LEVEL_ORDER: GeoLevel[] = ['place', 'county', 'metro', 'state', 'national']
const LOCAL_TOPICS = new Set<MarketTopic>(['housing_activity', 'building_permits', 'labor'])
const STALE_DAYS: Record<Frequency, number> = { weekly: 21, monthly: 120, quarterly: 330 }
const PERIODS_BACK: Record<MarketTimeframe, { monthly: number; weekly: number }> = {
  latest: { monthly: 1, weekly: 1 },
  last_3_months: { monthly: 3, weekly: 13 },
  last_12_months: { monthly: 12, weekly: 52 },
}

const BLS = 'U.S. Bureau of Labor Statistics'
const CENSUS_BPS = 'U.S. Census Bureau, Building Permits Survey'

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

export function isStale(observationDate: string, frequency: Frequency, today: string): boolean {
  return daysBetween(observationDate, today) > STALE_DAYS[frequency]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function periodLabel(date: string, frequency: Frequency): string {
  const [y, m, d] = date.split('-').map(Number)
  if (frequency === 'quarterly') return `Q${Math.floor((m - 1) / 3) + 1} ${y}`
  if (frequency === 'weekly') return `Week of ${MONTHS[m - 1]} ${d}, ${y}`
  return `${MONTHS[m - 1]} ${y}`
}

export function formatValue(value: number, format: Format): string {
  const n = (v: number, digits = 0) => v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })
  switch (format) {
    case 'count':
      return n(value)
    case 'jobs':
      return `${n(value)} jobs`
    case 'jobs_thousands':
      return `${n(value * 1000)} jobs`
    case 'usd':
      return `$${n(value)}`
    case 'usd_cents':
      return `$${n(value, 2)}`
    case 'index':
      return n(value, 1)
    case 'percent':
      return `${n(value, 2)}%`
    case 'thousands_saar':
      return `${n(value * 1000)} (annual rate)`
  }
}

const shiftMonths = (date: string, months: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits

type Observed = { def: Def; url: string; latest: Point; prior: Point | null; basis: string | null }

/** Picks the comparison point for a time series according to the timeframe and the series' seasonality. */
export function compareSeries(def: Pick<Def, 'frequency' | 'yearOverYearOnly'>, points: Point[], timeframe: MarketTimeframe) {
  const latest = points[0]
  if (!latest) return null
  const yearly = def.yearOverYearOnly || timeframe === 'last_12_months'
  if (def.frequency === 'weekly') {
    const weeks = yearly ? 52 : PERIODS_BACK[timeframe].weekly
    const target = Date.parse(latest.date) - weeks * 7 * 86_400_000
    const prior = points.find((p) => Math.abs(Date.parse(p.date) - target) <= 3 * 86_400_000) ?? null
    return { latest, prior, basis: weeks === 52 ? 'same week a year earlier' : weeks === 1 ? 'one week earlier' : `${weeks} weeks earlier` }
  }
  const months = yearly ? 12 : PERIODS_BACK[timeframe].monthly
  const prior = points.find((p) => p.date === shiftMonths(latest.date, -months)) ?? null
  const basis = months === 12 ? `same month a year earlier${def.yearOverYearOnly ? ' (not seasonally adjusted)' : ''}` : months === 1 ? 'one month earlier' : `${months} months earlier`
  return { latest, prior, basis }
}

function toResult(o: Observed, today: string): MarketSeriesResult {
  const { def, latest, prior } = o
  return {
    series_id: def.id,
    title: def.title,
    topics: def.topics,
    units: def.units,
    geography_level: def.level,
    geography: def.geography,
    source: def.source,
    source_url: o.url,
    frequency: def.frequency,
    seasonally_adjusted: def.seasonally_adjusted,
    observation_period: latest.date,
    period_label: periodLabel(latest.date, def.frequency),
    latest_value: latest.value,
    value_text: formatValue(latest.value, def.format),
    preliminary: latest.preliminary,
    comparison:
      prior && o.basis
        ? {
            observation_period: prior.date,
            period_label: periodLabel(prior.date, def.frequency),
            value: prior.value,
            change: round(latest.value - prior.value, 3),
            change_percent: prior.value ? round(((latest.value - prior.value) / prior.value) * 100, 1) : null,
            basis: o.basis,
          }
        : null,
    stale: isStale(latest.date, def.frequency, today),
  }
}

type Geo = {
  stateCode: string | null
  city: string | null
  place: PlaceGeography | null
  resolution: MarketIntelligence['geography']['resolution']
}

function planIndicators(topics: MarketTopic[], geo: Geo, fredConnected: boolean) {
  const defs: Def[] = []
  const notConnected: DataGap[] = []
  const has = (t: MarketTopic) => topics.includes(t)
  const permits = has('building_permits') || has('housing_activity')
  const st = geo.stateCode
  const stFips = st ? STATE_FIPS[st] : null
  const stateName = st ? US_STATES[st] : null
  const county = geo.place?.county ?? null
  const metro = geo.place?.metro ?? null
  const countyLabel = county && st ? `${county.name}, ${st}` : null
  const placeLabel = geo.place?.place && geo.city && st ? `${geo.city}, ${st}` : null
  const bps = (level: 'place' | 'county', label: string, kind: 'single' | 'total'): Def => ({
    id: `BPS-${level}-${kind}`,
    title: kind === 'single' ? `New single-family housing units authorized by permit (${label})` : `New housing units authorized by permit, all types (${label})`,
    topics: kind === 'single' ? ['building_permits', 'housing_activity'] : ['building_permits'],
    units: 'housing units per month',
    format: 'count',
    level,
    geography: label,
    source: CENSUS_BPS,
    provider: 'census_bps',
    frequency: 'monthly',
    seasonally_adjusted: false,
    yearOverYearOnly: true,
  })
  const bls = (d: Omit<Def, 'provider' | 'source'>): Def => ({ ...d, provider: 'bls', source: BLS })

  if (permits && placeLabel) defs.push(bps('place', placeLabel, 'single'), bps('place', placeLabel, 'total'))
  if (permits && countyLabel) defs.push(bps('county', countyLabel, 'single'), bps('county', countyLabel, 'total'))

  if (has('labor')) {
    if (countyLabel && county) {
      const base = { topics: ['labor'] as MarketTopic[], level: 'county' as const, geography: countyLabel, source: `${BLS}, QCEW`, provider: 'qcew' as const, frequency: 'quarterly' as const, seasonally_adjusted: false, yearOverYearOnly: true }
      defs.push(
        { ...base, id: `QCEW-${county.fips}-emp`, title: `Private construction employment (${countyLabel})`, units: 'jobs, quarter-end month', format: 'jobs' },
        { ...base, id: `QCEW-${county.fips}-wage`, title: `Average weekly wage, private construction (${countyLabel})`, units: 'dollars per week', format: 'usd' },
      )
    }
    if (metro && stFips) {
      const shared = { topics: ['labor'] as MarketTopic[], units: 'jobs, not seasonally adjusted', format: 'jobs_thousands' as const, level: 'metro' as const, geography: metro.name, frequency: 'monthly' as const, seasonally_adjusted: false, yearOverYearOnly: true, group: 'metro_employment' }
      defs.push(
        bls({ ...shared, id: `SMU${stFips}${metro.code}2000000001`, title: `Construction employment (${metro.name})` }),
        bls({ ...shared, id: `SMU${stFips}${metro.code}1500000001`, title: `Mining, logging, and construction employment (${metro.name})` }),
      )
    }
    if (stFips && stateName) {
      const shared = { topics: ['labor'] as MarketTopic[], units: 'jobs, seasonally adjusted', format: 'jobs_thousands' as const, level: 'state' as const, geography: stateName, frequency: 'monthly' as const, seasonally_adjusted: true, yearOverYearOnly: false, group: 'state_employment' }
      defs.push(
        bls({ ...shared, id: `SMS${stFips}000002000000001`, title: `Construction employment (${stateName})` }),
        bls({ ...shared, id: `SMS${stFips}000001500000001`, title: `Mining, logging, and construction employment (${stateName})` }),
      )
    }
    const national = { topics: ['labor'] as MarketTopic[], level: 'national' as const, geography: 'United States', frequency: 'monthly' as const, seasonally_adjusted: true, yearOverYearOnly: false }
    defs.push(
      bls({ ...national, id: 'CES2000000001', title: 'Construction employment (U.S.)', units: 'jobs, seasonally adjusted', format: 'jobs_thousands' }),
      bls({ ...national, id: 'CES2000000003', title: 'Average hourly earnings, construction (U.S.)', units: 'dollars per hour, seasonally adjusted', format: 'usd_cents' }),
    )
  }

  if (has('materials')) {
    const shared = { topics: ['materials'] as MarketTopic[], units: 'index, not seasonally adjusted', format: 'index' as const, level: 'national' as const, geography: 'United States', frequency: 'monthly' as const, seasonally_adjusted: false, yearOverYearOnly: false }
    defs.push(
      bls({ ...shared, id: 'WPUSI012011', title: 'Producer Price Index: construction materials (U.S.)' }),
      bls({ ...shared, id: 'WPU081', title: 'Producer Price Index: lumber and wood products (U.S.)' }),
    )
  }

  const fred = (d: Omit<Def, 'provider' | 'source'> & { source?: string }): Def => ({ source: 'U.S. Census Bureau via FRED', ...d, provider: 'fred' })
  const fredDefs: Def[] = []
  if (has('housing_activity')) fredDefs.push(fred({ id: 'HOUST', title: 'Housing starts, total (U.S.)', topics: ['housing_activity'], units: 'units, seasonally adjusted annual rate', format: 'thousands_saar', level: 'national', geography: 'United States', frequency: 'monthly', seasonally_adjusted: true, yearOverYearOnly: false }))
  if (has('building_permits')) {
    if (st && stateName) fredDefs.push(fred({ id: `${st}BPPRIVSA`, title: `New private housing units authorized by permit (${stateName})`, topics: ['building_permits'], units: 'units per month, seasonally adjusted', format: 'count', level: 'state', geography: stateName, frequency: 'monthly', seasonally_adjusted: true, yearOverYearOnly: false }))
    fredDefs.push(fred({ id: 'PERMIT', title: 'Building permits, total (U.S.)', topics: ['building_permits'], units: 'units, seasonally adjusted annual rate', format: 'thousands_saar', level: 'national', geography: 'United States', frequency: 'monthly', seasonally_adjusted: true, yearOverYearOnly: false }))
  }
  if (has('interest_rates')) fredDefs.push(fred({ id: 'MORTGAGE30US', title: '30-year fixed mortgage rate average (U.S.)', source: 'Freddie Mac via FRED', topics: ['interest_rates'], units: 'percent', format: 'percent', level: 'national', geography: 'United States', frequency: 'weekly', seasonally_adjusted: false, yearOverYearOnly: false }))

  if (fredConnected) defs.push(...fredDefs)
  else {
    for (const d of fredDefs) {
      notConnected.push({ topic: d.topics[0], indicator: d.title, reason: 'source_not_connected', detail: `${d.title}: this source is not connected` })
    }
  }
  return { defs, notConnected }
}

function withDeadline<T>(promise: Promise<T>, deadline: Promise<never>): Promise<T> {
  return Promise.race([promise, deadline])
}

const safeDetail = (error: unknown) => (error instanceof Error ? error.message : 'failed').replace(/(api_key|registrationkey)=[^&\s]+/gi, '$1=***').slice(0, 160)

const qcewObservations = (defs: Def[], q: QcewCounty): Observed[] => {
  const date = `${q.year}-${String(q.quarter * 3 - 2).padStart(2, '0')}-01`
  const yearAgo = `${q.year - 1}${date.slice(4)}`
  return defs.flatMap((def): Observed[] => {
    const [value, prior] = def.id.endsWith('-emp') ? [q.employment, q.employmentYearAgo] : [q.avgWeeklyWage, q.avgWeeklyWageYearAgo]
    if (value === null) return []
    return [{ def, url: q.url, latest: { date, value, preliminary: false }, prior: prior === null ? null : { date: yearAgo, value: prior, preliminary: false }, basis: 'same quarter a year earlier' }]
  })
}

const bpsObservations = (defs: Def[], p: PermitObservation): Observed[] => {
  const date = `20${p.yymm.slice(0, 2)}-${p.yymm.slice(2)}-01`
  const yearAgo = `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`
  return defs.map((def) => {
    const pick = (c: PermitObservation['latest']) => (def.id.endsWith('-single') ? c.singleFamilyUnits : c.totalUnits)
    return {
      def,
      url: p.url,
      latest: { date, value: pick(p.latest), preliminary: false },
      prior: p.yearAgo ? { date: yearAgo, value: pick(p.yearAgo), preliminary: false } : null,
      basis: 'same month a year earlier (not seasonally adjusted)',
    }
  })
}

const rollup = (ok: number, missing: number): Status => (!ok ? 'unavailable' : missing ? 'partial' : 'ok')

/**
 * One bounded server-side operation for several categories: the place is resolved once (and cached),
 * providers run in parallel under one deadline, and one failed source never hides the others.
 */
export async function getConstructionMarketIntelligence(
  request: { topics: MarketTopic[]; location?: string | null; timeframe?: MarketTimeframe | null },
  deps: MarketDeps,
  known: KnownPlace = {},
): Promise<MarketIntelligence> {
  const topics = [...new Set(request.topics.length ? request.topics : BRIEFING_TOPICS)]
  const timeframe = request.timeframe ?? 'last_12_months'
  const location = resolveLocation(request.location, known)
  const http = { fetchImpl: deps.fetchImpl, timeoutMs: deps.timeoutMs, cache: deps.cache }
  const providers: ProviderStatus[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timed out')), deps.deadlineMs ?? 20_000)
  })
  deadline.catch(() => {})

  try {
    const geo: Geo = { stateCode: location.stateCode, city: location.city, place: null, resolution: location.stateCode ? 'state_only' : 'national' }
    if (location.city && location.stateCode && topics.some((t) => LOCAL_TOPICS.has(t))) {
      try {
        geo.place = await withDeadline(resolvePlaceGeography(location.city, location.stateCode, http), deadline)
        geo.resolution = geo.place.status
        providers.push({ provider: 'census_geography', status: 'ok', detail: geo.place.status })
      } catch (error) {
        geo.resolution = 'lookup_failed'
        providers.push({ provider: 'census_geography', status: 'failed', detail: safeDetail(error) })
      }
    }

    const fredKey = deps.fredApiKey?.trim() || null
    const { defs, notConnected } = planIndicators(topics, geo, !!fredKey)
    const of = (p: Provider) => defs.filter((d) => d.provider === p)
    const stateFips = location.stateCode ? STATE_FIPS[location.stateCode] : null
    const region = location.stateCode ? censusRegion(location.stateCode) : null
    const county = geo.place?.county ?? null
    const placeFips = geo.place?.place?.geoid.slice(2) ?? null
    const placeDefs = of('census_bps').filter((d) => d.level === 'place')
    const countyDefs = of('census_bps').filter((d) => d.level === 'county')

    const run = async <T>(provider: Provider, needed: boolean, load: () => Promise<T>): Promise<T | null> => {
      if (!needed) return null
      try {
        const value = await withDeadline(load(), deadline)
        if (!providers.some((p) => p.provider === provider)) providers.push({ provider, status: 'ok', detail: null })
        return value
      } catch (error) {
        providers.push({ provider, status: 'failed', detail: safeDetail(error) })
        throw error
      }
    }
    const settle = <T>(p: Promise<T>) => p.then((value) => ({ ok: true as const, value }), () => ({ ok: false as const }))

    const [blsR, qcewR, placeR, countyR, ...fredR] = await Promise.all([
      settle(run('bls', of('bls').length > 0, () => loadBlsSeries(of('bls').map((d) => d.id), deps.today, { ...http, blsApiKey: deps.blsApiKey }))),
      settle(run('qcew', of('qcew').length > 0 && !!county, () => loadQcewCounty(county!.fips, deps.today, http))),
      settle(run('census_bps', placeDefs.length > 0 && !!stateFips && !!region && !!placeFips, () => loadBpsPermits({ kind: 'place', region: region! }, { stateFips: stateFips!, place: placeFips! }, deps.today, http))),
      settle(run('census_bps', countyDefs.length > 0 && !!stateFips && !!county, () => loadBpsPermits({ kind: 'county' }, { stateFips: stateFips!, county: county!.fips.slice(2) }, deps.today, http))),
      ...of('fred').map((d) => settle(run('fred', true, () => loadFredSeries(d.id, fredKey!, http)))),
    ])

    const observed: Observed[] = []
    const failed = new Set<string>()
    const suppressed = new Set<string>()

    if (blsR.ok && blsR.value) {
      for (const def of of('bls')) {
        const points = blsR.value.get(def.id)
        const cmp = points && compareSeries(def, points, timeframe)
        if (cmp) observed.push({ def, url: blsSeriesUrl(def.id), ...cmp })
      }
    } else if (!blsR.ok) of('bls').forEach((d) => failed.add(d.id))

    if (qcewR.ok && qcewR.value) {
      if (!qcewR.value.disclosed) of('qcew').forEach((d) => suppressed.add(d.id))
      observed.push(...qcewObservations(of('qcew'), qcewR.value))
    } else if (!qcewR.ok) of('qcew').forEach((d) => failed.add(d.id))

    if (placeR.ok && placeR.value) observed.push(...bpsObservations(placeDefs, placeR.value))
    else if (!placeR.ok) placeDefs.forEach((d) => failed.add(d.id))
    if (countyR.ok && countyR.value) observed.push(...bpsObservations(countyDefs, countyR.value))
    else if (!countyR.ok) countyDefs.forEach((d) => failed.add(d.id))

    of('fred').forEach((def, i) => {
      const r = fredR[i]
      const cmp = r.ok && r.value ? compareSeries(def, r.value, timeframe) : null
      if (cmp) observed.push({ def, url: fredSeriesUrl(def.id), ...cmp })
      else if (!r.ok) failed.add(def.id)
    })

    // Keep one series per alternative group (e.g. metro "construction" before "mining, logging, and construction").
    const usedGroups = new Set<string>()
    const kept = defs.flatMap((def) => {
      const o = observed.find((x) => x.def.id === def.id)
      if (!o) return []
      if (def.group) {
        if (usedGroups.has(def.group)) return []
        usedGroups.add(def.group)
      }
      return [o]
    })
    const series = kept.map((o) => toResult(o, deps.today))
    const loadedIds = new Set(series.map((s) => s.series_id))

    const gaps: DataGap[] = []
    const seenGroups = new Set<string>()
    for (const def of defs) {
      if (loadedIds.has(def.id) || (def.group && (usedGroups.has(def.group) || seenGroups.has(def.group)))) continue
      if (def.group) seenGroups.add(def.group)
      const label = def.group ? def.title.replace(/^Mining, logging, and construction/, 'Construction') : def.title
      const reason: GapReason = failed.has(def.id) ? 'source_unavailable' : suppressed.has(def.id) ? 'suppressed' : 'not_published_for_geography'
      const detail =
        reason === 'source_unavailable'
          ? `${label}: the official source did not respond`
          : reason === 'suppressed'
            ? `${label}: withheld by BLS to protect employer confidentiality`
            : `${label}: not published for ${def.geography}`
      gaps.push({ topic: def.topics[0], indicator: label, reason, detail })
    }
    gaps.push(...notConnected)
    if (topics.includes('construction_news')) {
      gaps.push({ topic: 'construction_news', indicator: 'Construction news', reason: 'no_provider', detail: 'Construction news: no news source is connected, so no articles were retrieved' })
    }
    const stateName = location.stateCode ? US_STATES[location.stateCode] : null
    const locationNote = (() => {
      const p = geo.place
      switch (geo.resolution) {
        case 'resolved':
          return p?.county
            ? `${location.city} was matched to ${p.county.name}${p.metro ? ` and the ${p.metro.name}` : ''} using Census geography (the county containing the city's Census internal point).`
            : null
        case 'not_found':
          return `"${location.city}" was not found as a Census place in ${stateName}; state and national data are shown.`
        case 'ambiguous':
          return `More than one Census place named "${location.city}" exists in ${stateName}. Ask which one; state and national data are shown.`
        case 'lookup_failed':
          return `The county and metro area for ${location.city} could not be determined right now; state and national data are shown.`
        default:
          return location.note
      }
    })()
    if (['not_found', 'ambiguous', 'lookup_failed'].includes(geo.resolution)) {
      gaps.push({ topic: 'location', indicator: 'City, county, and metro data', reason: 'location_not_resolved', detail: locationNote ?? 'Location could not be resolved' })
    }

    const categories = topics.map((topic) => {
      const ids = series.filter((s) => s.topics.includes(topic)).map((s) => s.series_id)
      const missing = gaps.filter((g) => g.topic === topic).length
      return { topic, status: rollup(ids.length, missing), series_ids: ids }
    })
    const loadedLevels = LEVEL_ORDER.filter((l) => series.some((s) => s.geography_level === l))
    const notes = [
      ...MARKET_NOTES,
      ...(topics.includes('materials') ? ['Materials price indexes are national producer prices; no county or metro materials price index is published.'] : []),
      ...(series.some((s) => s.source === CENSUS_BPS) ? ['Monthly permit counts are not seasonally adjusted, are compared with the same month a year earlier, and are revised by the Census Bureau.'] : []),
      ...(series.some((s) => s.frequency === 'quarterly') ? ['County employment and wages come from the BLS Quarterly Census of Employment and Wages, published about six months after each quarter ends.'] : []),
      ...(series.some((s) => s.preliminary) ? ['Values marked preliminary may be revised in the next release.'] : []),
      ...(series.some((s) => s.stale) ? ['Some series are stale: their latest observation is older than usual for their release schedule.'] : []),
      ...(series.length ? [] : ['No official source responded, so current conditions could not be verified. Do not present general knowledge as current data.']),
    ]

    return {
      status: !series.length ? 'unavailable' : gaps.length ? 'partial' : 'ok',
      topics,
      timeframe,
      geography: {
        requested: request.location ?? null,
        location: location.label,
        location_source: location.source,
        city: location.city,
        county: geo.place?.county?.name ?? null,
        county_fips: geo.place?.county?.fips ?? null,
        metro: geo.place?.metro?.name ?? null,
        metro_code: geo.place?.metro?.code ?? null,
        state: stateName,
        resolution: geo.resolution,
        best_data_level: loadedLevels[0] ?? 'national',
        note: locationNote,
      },
      categories,
      series,
      data_gaps: gaps,
      notes,
      retrieved_at: deps.today,
      providers,
    }
  } finally {
    clearTimeout(timer)
  }
}

export type MarketSummary = {
  location: string
  coverage: string[]
  indicators: { label: string; value: string; geography: string; period: string; change: string | null; preliminary: boolean; stale: boolean }[]
  gaps: string[]
  retrieved_at: string
}

const LEVEL_LABEL: Record<GeoLevel, string> = { place: 'City', county: 'County', metro: 'Metro', state: 'State', national: 'National' }

/** Compact, display-ready view for the assistant drawer, most local indicators first. */
export function summarizeMarket(r: MarketIntelligence): MarketSummary {
  const ordered = [...r.series].sort((a, b) => LEVEL_ORDER.indexOf(a.geography_level) - LEVEL_ORDER.indexOf(b.geography_level))
  return {
    location: r.geography.location,
    coverage: LEVEL_ORDER.filter((l) => r.series.some((s) => s.geography_level === l)).map((l) => LEVEL_LABEL[l]),
    indicators: ordered.slice(0, 8).map((s) => ({
      label: s.title.replace(/\s*\([^)]*\)\s*$/, ''),
      value: s.value_text,
      geography: s.geography,
      period: s.period_label,
      change:
        s.comparison && s.comparison.change_percent !== null
          ? `${s.comparison.change_percent > 0 ? '+' : ''}${s.comparison.change_percent}% vs ${s.comparison.period_label}`
          : null,
      preliminary: s.preliminary,
      stale: s.stale,
    })),
    gaps: r.data_gaps.slice(0, 4).map((g) => g.detail),
    retrieved_at: r.retrieved_at,
  }
}
