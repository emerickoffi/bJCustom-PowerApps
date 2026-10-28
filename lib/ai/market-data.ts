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

/** Common Texas markets, so a city-only question still resolves to its state's data. */
const CITY_STATE: Record<string, string> = {
  dallas: 'TX', 'fort worth': 'TX', houston: 'TX', austin: 'TX', 'san antonio': 'TX', plano: 'TX', frisco: 'TX',
  mckinney: 'TX', arlington: 'TX', denton: 'TX', 'el paso': 'TX', waco: 'TX', tyler: 'TX', lubbock: 'TX',
}

export type ResolvedLocation = { stateCode: string | null; label: string; note: string | null }

/** Maps free text like "Dallas", "Dallas, TX", or "Texas" to a state; anything else is national. */
export function resolveLocation(text: string | null | undefined): ResolvedLocation {
  const raw = (text ?? '').trim()
  if (!raw || /^(us|usa|u\.s\.|united states|national|nationwide)$/i.test(raw)) {
    return { stateCode: null, label: 'United States', note: null }
  }
  const lower = raw.toLowerCase()
  const code = raw.match(/(?:^|[\s,])([A-Z]{2})$/)?.[1] ?? (/^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null)
  const byName = Object.entries(US_STATES).find(([, name]) => new RegExp(`\\b${name.toLowerCase()}\\b`).test(lower))?.[0]
  const byCity = Object.entries(CITY_STATE).find(([city]) => new RegExp(`\\b${city}\\b`).test(lower))?.[1]
  const stateCode = (code && US_STATES[code] ? code : null) ?? byName ?? byCity ?? null
  if (!stateCode) {
    return { stateCode: null, label: 'United States', note: `"${raw.slice(0, 60)}" could not be matched to a U.S. state; national data is shown.` }
  }
  const cityLevel = Boolean(byCity) || /,/.test(raw)
  return {
    stateCode,
    label: US_STATES[stateCode],
    note: cityLevel ? `City or metro-level series are not connected; ${US_STATES[stateCode]} statewide data is the closest available.` : null,
  }
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

export type MarketIntelligence = {
  status: 'ok' | 'partial' | 'unavailable'
  topic: MarketTopic
  timeframe: MarketTimeframe
  geography: { requested: string | null; resolved: string; note: string | null }
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

export async function getConstructionMarketIntelligence(
  request: { topic: MarketTopic; location?: string | null; timeframe?: MarketTimeframe | null },
  deps: MarketDeps,
): Promise<MarketIntelligence> {
  const timeframe = request.timeframe ?? 'last_12_months'
  const location = resolveLocation(request.location)
  const base = {
    topic: request.topic,
    timeframe,
    geography: { requested: request.location ?? null, resolved: location.label, note: location.note },
    retrieved_at: deps.today,
  }
  if (request.topic === 'construction_news') {
    return { ...base, status: 'unavailable', series: [], unavailable: ['construction news'], notes: [
      'No news or web-search provider is connected to this application, so current news could not be verified. Do not summarize news from memory.',
      'Indicators for housing activity, permits, materials prices, labor, and mortgage rates are available on request.',
    ] }
  }
  if (!deps.apiKey?.trim()) {
    return { ...base, status: 'unavailable', series: [], unavailable: ['FRED market data'], notes: [
      'Live market data is not configured (FRED_API_KEY is not set), so current conditions could not be verified. Do not present general knowledge as current data.',
    ] }
  }

  const defs = seriesFor(request.topic, location.stateCode).slice(0, 3)
  const settled = await Promise.allSettled(defs.map((d) => loadSeries(d, timeframe, deps)))
  const series = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  const unavailable = settled.flatMap((r, i) => (r.status === 'rejected' ? [defs[i].title] : []))
  return {
    ...base,
    status: !series.length ? 'unavailable' : unavailable.length ? 'partial' : 'ok',
    series,
    unavailable,
    notes: [
      ...MARKET_NOTES,
      ...(series.length ? [] : ['The market data provider did not respond, so current conditions could not be verified.']),
      ...(series.some((s) => s.stale) ? ['Some series are stale: their latest observation is older than usual for their release schedule.'] : []),
    ],
  }
}
