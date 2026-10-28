/**
 * Read-only construction market data from the official FRED API (Federal Reserve Bank of St. Louis),
 * which republishes U.S. Census building-permit and housing-start data, BLS producer prices and
 * employment, and the Freddie Mac mortgage survey. Only catalog series are requested from a fixed
 * host, so no caller-supplied URL is ever fetched. Only a two-letter state code (never project
 * details) leaves the server. Pure apart from the injected fetch, so it is unit tested with mocks.
 */

export const MARKET_TOPICS = [
  'housing_activity',
  'building_permits',
  'materials',
  'labor',
  'interest_rates',
  'construction_news',
] as const
export type MarketTopic = (typeof MARKET_TOPICS)[number]

export const MARKET_TIMEFRAMES = ['latest', 'last_3_months', 'last_12_months'] as const
export type MarketTimeframe = (typeof MARKET_TIMEFRAMES)[number]

type Frequency = 'monthly' | 'weekly'
type SeriesDef = { id: string; title: string; units: string; frequency: Frequency; source: string; geography: string }

const FRED_API = 'https://api.stlouisfed.org/fred'
const FRED_SERIES_PAGE = 'https://fred.stlouisfed.org/series/'
const SERIES_ID = /^[A-Z0-9]{3,20}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const NATIONAL: Record<Exclude<MarketTopic, 'construction_news'>, SeriesDef[]> = {
  housing_activity: [
    { id: 'HOUST', title: 'Housing starts, total (U.S.)', units: 'thousands of units, seasonally adjusted annual rate', frequency: 'monthly', source: 'U.S. Census Bureau via FRED', geography: 'national' },
    { id: 'PERMIT1', title: 'Single-family building permits (U.S.)', units: 'thousands of units, seasonally adjusted annual rate', frequency: 'monthly', source: 'U.S. Census Bureau via FRED', geography: 'national' },
  ],
  building_permits: [
    { id: 'PERMIT', title: 'Building permits, total (U.S.)', units: 'thousands of units, seasonally adjusted annual rate', frequency: 'monthly', source: 'U.S. Census Bureau via FRED', geography: 'national' },
    { id: 'PERMIT1', title: 'Single-family building permits (U.S.)', units: 'thousands of units, seasonally adjusted annual rate', frequency: 'monthly', source: 'U.S. Census Bureau via FRED', geography: 'national' },
  ],
  materials: [
    { id: 'WPU081', title: 'Producer Price Index: lumber and wood products (U.S.)', units: 'index, 1982=100', frequency: 'monthly', source: 'U.S. Bureau of Labor Statistics via FRED', geography: 'national' },
    { id: 'WPUSI012011', title: 'Producer Price Index: construction materials (U.S.)', units: 'index, 1982=100', frequency: 'monthly', source: 'U.S. Bureau of Labor Statistics via FRED', geography: 'national' },
  ],
  labor: [
    { id: 'CES2000000001', title: 'Construction employment (U.S.)', units: 'thousands of employees, seasonally adjusted', frequency: 'monthly', source: 'U.S. Bureau of Labor Statistics via FRED', geography: 'national' },
  ],
  interest_rates: [
    { id: 'MORTGAGE30US', title: '30-year fixed mortgage rate average (U.S.)', units: 'percent', frequency: 'weekly', source: 'Freddie Mac via FRED', geography: 'national' },
  ],
}

const STATE_TOPICS = new Set<MarketTopic>(['housing_activity', 'building_permits'])

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
}

export type KnownPlace = { city?: string | null; state?: string | null }

export type ResolvedLocation = {
  city: string | null
  stateCode: string | null
  /** Most specific place the user asked about, e.g. "Cedar Hill, Texas". */
  label: string
  /** Most specific level any connected series covers for this place. */
  dataLevel: 'state' | 'national'
  note: string | null
}

const NATIONAL_WORDS = /^(us|usa|u\.s\.?|united states|america|national|nationwide|the country)$/i
const LOCAL_WORDS = /^(our|my|the|this|local|here|nearby|around here|in our)?\s*(area|region|market|city|town|local|here)?$/i

function toStateCode(text: string): string | null {
  const t = text.trim().replace(/\.$/, '')
  if (/^[A-Za-z]{2}$/.test(t) && US_STATES[t.toUpperCase()]) return t.toUpperCase()
  const lower = t.toLowerCase()
  return Object.entries(US_STATES).find(([, name]) => name.toLowerCase() === lower)?.[0] ?? null
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())

/**
 * Splits free text into city and state without a city list: "Cedar Hill, TX", "Cedar Hill Texas", "Texas", "TX".
 * A bare city name, or a phrase like "our area", uses the known company/project place only when it matches.
 */
export function resolveLocation(text: string | null | undefined, known: KnownPlace = {}): ResolvedLocation {
  const raw = (text ?? '').trim().slice(0, 80)
  const knownState = known.state ? toStateCode(known.state) : null
  const knownCity = known.city?.trim() || null
  const build = (city: string | null, stateCode: string | null, note: string | null = null): ResolvedLocation => {
    if (!stateCode) return { city: null, stateCode: null, label: 'United States', dataLevel: 'national', note }
    const state = US_STATES[stateCode]
    return {
      city,
      stateCode,
      label: city ? `${city}, ${state}` : state,
      dataLevel: 'state',
      note:
        note ??
        (city
          ? `No city or metro-area series is connected for ${city}; the closest available geography is ${state} statewide, and other indicators are national.`
          : null),
    }
  }

  if (NATIONAL_WORDS.test(raw)) return build(null, null)
  if (!raw || LOCAL_WORDS.test(raw)) {
    return knownState ? build(knownCity ? titleCase(knownCity) : null, knownState) : build(null, null, 'No company or project location is on file; national data is shown.')
  }

  const whole = toStateCode(raw)
  if (whole) return build(null, whole)

  const comma = raw.match(/^(.+?),\s*([A-Za-z .]+)$/)
  const trailing = Object.entries(US_STATES)
    .map(([code, name]) => raw.match(new RegExp(`^(.+?)\\s+(${name}|${code})$`, 'i')) && { code, city: raw.replace(new RegExp(`\\s+(${name}|${code})$`, 'i'), '') })
    .find(Boolean)
  const city = comma ? comma[1] : trailing ? trailing.city : raw
  const stateCode = comma ? toStateCode(comma[2]) : trailing ? trailing.code : null
  if (stateCode) return build(titleCase(city), stateCode)

  if (knownState && knownCity && knownCity.toLowerCase() === city.toLowerCase()) return build(titleCase(city), knownState)
  return build(null, null, `The state for "${city}" was not given, so national data is shown. Ask which state if local data matters.`)
}

export function seriesFor(topic: MarketTopic, stateCode: string | null): SeriesDef[] {
  if (topic === 'construction_news') return []
  const national = NATIONAL[topic]
  if (!stateCode || !STATE_TOPICS.has(topic) || !US_STATES[stateCode]) return national
  return [
    {
      id: `${stateCode}BPPRIVSA`,
      title: `New private housing units authorized by building permits (${US_STATES[stateCode]})`,
      units: 'units per month, seasonally adjusted',
      frequency: 'monthly',
      source: 'U.S. Census Bureau via FRED',
      geography: `state: ${US_STATES[stateCode]}`,
    },
    ...national,
  ]
}

export type Observation = { date: string; value: number }

/** Validated observations, newest first. FRED marks missing values with ".", which are skipped. */
export function parseObservations(json: unknown): Observation[] | null {
  const list = (json as { observations?: unknown })?.observations
  if (!Array.isArray(list)) return null
  const rows: Observation[] = []
  for (const o of list) {
    const date = (o as { date?: unknown })?.date
    const raw = (o as { value?: unknown })?.value
    const value = typeof raw === 'string' && raw.trim() !== '' && raw !== '.' ? Number(raw) : Number.NaN
    if (typeof date === 'string' && DATE.test(date) && !Number.isNaN(Date.parse(date)) && Number.isFinite(value)) {
      rows.push({ date, value })
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)

/** Monthly data normally lags about 1-2 months; weekly data about 1 week. Older than that is labeled stale. */
export function isStale(observationDate: string, frequency: Frequency, today: string): boolean {
  return daysBetween(observationDate, today) > (frequency === 'weekly' ? 21 : 120)
}

const PERIODS_BACK: Record<MarketTimeframe, Record<Frequency, number>> = {
  latest: { monthly: 1, weekly: 1 },
  last_3_months: { monthly: 3, weekly: 13 },
  last_12_months: { monthly: 12, weekly: 52 },
}

export const isAllowedSourceUrl = (url: string) =>
  url.startsWith(FRED_SERIES_PAGE) && SERIES_ID.test(url.slice(FRED_SERIES_PAGE.length))

export type MarketSeriesResult = {
  series_id: string
  title: string
  units: string
  geography: string
  source: string
  source_url: string
  /** The economic reference period of the latest value, not a publication date. */
  observation_period: string
  latest_value: number
  comparison: { observation_period: string; value: number; change: number; change_percent: number | null } | null
  /** When FRED last updated the series (publication/revision date), if available. */
  source_last_updated: string | null
  stale: boolean
}

type Status = 'ok' | 'partial' | 'unavailable'

export type MarketIntelligence = {
  status: Status
  /** Present when nothing could be fetched because the data provider is not set up. */
  configuration: 'not_configured' | null
  topics: MarketTopic[]
  timeframe: MarketTimeframe
  geography: {
    requested: string | null
    location: string
    city: string | null
    state: string | null
    /** Each series also carries its own geography label; never call national values local. */
    best_data_level: 'state' | 'national'
    note: string | null
  }
  categories: { topic: MarketTopic; status: Status; series_ids: string[] }[]
  series: MarketSeriesResult[]
  unavailable: string[]
  notes: string[]
  retrieved_at: string
}

type FetchLike = (url: string, init?: RequestInit & { next?: { revalidate?: number } }) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>

export type MarketDeps = {
  apiKey: string | null | undefined
  fetchImpl: FetchLike
  today: string
  timeoutMs?: number
  /** Public market data only; never tenant data. */
  revalidateSeconds?: number
}

export const MARKET_NOTES = [
  'Economic indicators are aggregate statistics, not supplier quotes. Do not present them as local material prices.',
  'NAHB research and construction news are not connected; no articles or headlines were retrieved.',
]

async function getJson(url: string, deps: MarketDeps): Promise<unknown> {
  const res = await deps.fetchImpl(url, {
    signal: AbortSignal.timeout(deps.timeoutMs ?? 6000),
    headers: { Accept: 'application/json' },
    next: { revalidate: deps.revalidateSeconds ?? 21_600 },
  })
  if (!res.ok) throw new Error(`FRED responded ${res.status}`)
  return res.json()
}

async function loadSeries(def: SeriesDef, timeframe: MarketTimeframe, deps: MarketDeps): Promise<MarketSeriesResult> {
  if (!SERIES_ID.test(def.id)) throw new Error('invalid series id')
  const back = PERIODS_BACK[timeframe][def.frequency]
  const key = encodeURIComponent(deps.apiKey ?? '')
  const id = encodeURIComponent(def.id)
  const [observations, meta] = await Promise.all([
    getJson(`${FRED_API}/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${back + 6}`, deps),
    getJson(`${FRED_API}/series?series_id=${id}&api_key=${key}&file_type=json`, deps).catch(() => null),
  ])
  const rows = parseObservations(observations)
  if (!rows?.length) throw new Error('no valid observations')
  const latest = rows[0]
  const prior = rows[Math.min(back, rows.length - 1)]
  const lastUpdated = (meta as { seriess?: { last_updated?: unknown }[] } | null)?.seriess?.[0]?.last_updated
  return {
    series_id: def.id,
    title: def.title,
    units: def.units,
    geography: def.geography,
    source: def.source,
    source_url: `${FRED_SERIES_PAGE}${def.id}`,
    observation_period: latest.date,
    latest_value: latest.value,
    comparison:
      prior && prior !== latest
        ? {
            observation_period: prior.date,
            value: prior.value,
            change: Math.round((latest.value - prior.value) * 1000) / 1000,
            change_percent: prior.value ? Math.round(((latest.value - prior.value) / prior.value) * 1000) / 10 : null,
          }
        : null,
    source_last_updated: typeof lastUpdated === 'string' && DATE.test(lastUpdated.slice(0, 10)) ? lastUpdated.slice(0, 10) : null,
    stale: isStale(latest.date, def.frequency, deps.today),
  }
}

/** Every indicator category, used when the user asks for a general market briefing. */
export const BRIEFING_TOPICS: MarketTopic[] = ['housing_activity', 'building_permits', 'materials', 'labor', 'interest_rates']

const MAX_SERIES = 8
const CONCURRENCY = 4

async function mapLimited<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try {
        results[i] = { status: 'fulfilled', value: await run(items[i]) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const rollup = (ok: number, failed: number): Status => (!ok ? 'unavailable' : failed ? 'partial' : 'ok')

/**
 * One bounded server-side operation for several categories: the location is resolved once, shared series
 * are fetched once, at most CONCURRENCY requests run at a time, and one failed series never hides the rest.
 */
export async function getConstructionMarketIntelligence(
  request: { topics: MarketTopic[]; location?: string | null; timeframe?: MarketTimeframe | null },
  deps: MarketDeps,
  known: KnownPlace = {},
): Promise<MarketIntelligence> {
  const topics = [...new Set(request.topics.length ? request.topics : BRIEFING_TOPICS)]
  const timeframe = request.timeframe ?? 'last_12_months'
  const location = resolveLocation(request.location, known)
  const wantsNews = topics.includes('construction_news')
  const indicatorTopics = topics.filter((t) => t !== 'construction_news')
  const newsNote = 'No news or web-search provider is connected, so no articles or headlines were retrieved. Do not summarize news from memory.'
  const base = {
    topics,
    timeframe,
    geography: {
      requested: request.location ?? null,
      location: location.label,
      city: location.city,
      state: location.stateCode ? US_STATES[location.stateCode] : null,
      best_data_level: location.dataLevel,
      note: location.note,
    },
    retrieved_at: deps.today,
  }
  const newsCategory = wantsNews ? [{ topic: 'construction_news' as const, status: 'unavailable' as const, series_ids: [] }] : []

  if (!indicatorTopics.length || !deps.apiKey?.trim()) {
    const notConfigured = indicatorTopics.length > 0
    return {
      ...base,
      status: 'unavailable',
      configuration: notConfigured ? 'not_configured' : null,
      categories: [...indicatorTopics.map((topic) => ({ topic, status: 'unavailable' as const, series_ids: [] })), ...newsCategory],
      series: [],
      unavailable: [...indicatorTopics, ...(wantsNews ? ['construction_news'] : [])],
      notes: [
        ...(notConfigured
          ? ['Live market indicators are not connected for this workspace yet, so current conditions could not be verified. Do not present general knowledge as current data.']
          : []),
        ...(wantsNews ? [newsNote] : []),
      ],
    }
  }

  const byTopic = new Map(indicatorTopics.map((t) => [t, seriesFor(t, location.stateCode)]))
  const defs = [...new Map([...byTopic.values()].flat().map((d) => [d.id, d])).values()].slice(0, MAX_SERIES)
  const settled = await mapLimited(defs, CONCURRENCY, (d) => loadSeries(d, timeframe, deps))
  const loaded = new Map(settled.flatMap((r) => (r.status === 'fulfilled' ? [[r.value.series_id, r.value] as const] : [])))
  const series = [...loaded.values()]
  const unavailable = settled.flatMap((r, i) => (r.status === 'rejected' ? [defs[i].title] : []))
  const categories = [
    ...indicatorTopics.map((topic) => {
      const ids = (byTopic.get(topic) ?? []).map((d) => d.id).filter((id) => defs.some((d) => d.id === id))
      const ok = ids.filter((id) => loaded.has(id))
      return { topic, status: rollup(ok.length, ids.length - ok.length), series_ids: ok }
    }),
    ...newsCategory,
  ]
  return {
    ...base,
    status: rollup(series.length, unavailable.length + (wantsNews ? 1 : 0)),
    configuration: null,
    categories,
    series,
    unavailable: [...unavailable, ...(wantsNews ? ['construction_news'] : [])],
    notes: [
      MARKET_NOTES[0],
      ...(wantsNews ? [newsNote] : []),
      ...(series.length ? [] : ['The market data provider did not respond, so current conditions could not be verified.']),
      ...(series.some((s) => s.stale) ? ['Some series are stale: their latest observation is older than usual for their release schedule.'] : []),
    ],
  }
}
