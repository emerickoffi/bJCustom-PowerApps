/**
 * Official public data providers, each with a strict parser. BLS (CES/SM/PPI time series and QCEW county
 * files) and the Census Building Permits Survey need no key; FRED is optional and only adds national
 * housing starts, mortgage rates, and seasonally adjusted permit totals.
 */
import { cached, fetchWithRetry, HOUR, type HttpDeps } from './market-http.ts'
import type { CensusRegion } from './market-geography.ts'

export type Point = { date: string; value: number; preliminary: boolean }

const DATE = /^\d{4}-\d{2}-\d{2}$/

// ---------- BLS time series (CES national, SM state and metro, PPI) ----------

const BLS_V1 = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'
const BLS_V2 = 'https://api.bls.gov/publicAPI/v2/timeseries/data/'
export const BLS_SERIES_ID = /^[A-Z0-9]{10,25}$/
export const blsSeriesUrl = (id: string) => `https://data.bls.gov/timeseries/${id}`

/** Monthly observations per series, newest first. Annual averages (M13) and non-numeric values are skipped. */
export function parseBlsResponse(json: unknown): { series: Map<string, Point[]>; limitReached: boolean } {
  const body = json as { message?: unknown; Results?: { series?: unknown } } | null
  const messages = Array.isArray(body?.message) ? body.message.filter((m): m is string => typeof m === 'string') : []
  const series = new Map<string, Point[]>()
  const list = body?.Results?.series
  if (Array.isArray(list)) {
    for (const s of list as { seriesID?: unknown; data?: unknown }[]) {
      if (typeof s?.seriesID !== 'string' || !BLS_SERIES_ID.test(s.seriesID) || !Array.isArray(s.data)) continue
      const rows: Point[] = []
      for (const d of s.data as { year?: unknown; period?: unknown; value?: unknown; footnotes?: unknown }[]) {
        if (typeof d?.year !== 'string' || !/^\d{4}$/.test(d.year)) continue
        if (typeof d.period !== 'string' || !/^M(0[1-9]|1[0-2])$/.test(d.period)) continue
        const value = typeof d.value === 'string' ? Number(d.value.replace(/,/g, '')) : Number.NaN
        if (!Number.isFinite(value)) continue
        const preliminary = Array.isArray(d.footnotes) && d.footnotes.some((f) => (f as { code?: unknown })?.code === 'P')
        rows.push({ date: `${d.year}-${d.period.slice(1)}-01`, value, preliminary })
      }
      if (rows.length) series.set(s.seriesID, rows.sort((a, b) => b.date.localeCompare(a.date)))
    }
  }
  return { series, limitReached: messages.some((m) => /threshold|daily limit|exceeded/i.test(m)) }
}

export function loadBlsSeries(ids: string[], today: string, deps: HttpDeps & { blsApiKey?: string | null }): Promise<Map<string, Point[]>> {
  const valid = [...new Set(ids)].filter((id) => BLS_SERIES_ID.test(id)).sort().slice(0, 25)
  if (!valid.length) return Promise.resolve(new Map())
  const year = Number(today.slice(0, 4))
  return cached(deps, `bls:${year}:${valid.join(',')}`, 6 * HOUR, async () => {
    const key = deps.blsApiKey?.trim()
    const res = await fetchWithRetry(
      key ? BLS_V2 : BLS_V1,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ seriesid: valid, startyear: String(year - 2), endyear: String(year), ...(key ? { registrationkey: key } : {}) }),
      },
      deps,
    )
    if (!res.ok) throw new Error(`BLS responded ${res.status}`)
    const parsed = parseBlsResponse(await res.json())
    if (!parsed.series.size) throw new Error(parsed.limitReached ? 'BLS daily request limit reached' : 'BLS returned no series')
    return parsed.series
  })
}

// ---------- BLS QCEW (county construction employment and wages) ----------

export type QcewCounty = {
  year: number
  quarter: number
  disclosed: boolean
  employment: number | null
  employmentYearAgo: number | null
  avgWeeklyWage: number | null
  avgWeeklyWageYearAgo: number | null
  url: string
}

export const qcewUrl = (year: number, quarter: number, fips: string) => `https://data.bls.gov/cew/data/api/${year}/${quarter}/area/${fips}.csv`

/** Private-sector (own_code 5) construction (NAICS 23) row; the "oty" columns give over-the-year change. */
export function parseQcewCsv(csv: string, fips: string): Omit<QcewCounty, 'url'> | null {
  if (!/^\d{5}$/.test(fips)) return null
  const lines = csv.split(/\r?\n/)
  const header = (lines[0] ?? '').split(',').map((h) => h.replace(/"/g, '').trim())
  if (header[0] !== 'area_fips') return null
  const row = lines.find((l) => l.startsWith(`"${fips}","5","23",`))
  if (!row) return null
  const cells = row.split(',').map((c) => c.replace(/"/g, '').trim())
  const num = (name: string) => {
    const i = header.indexOf(name)
    const v = i >= 0 && cells[i] !== '' ? Number(cells[i]) : Number.NaN
    return Number.isFinite(v) ? v : null
  }
  const year = num('year')
  const quarter = num('qtr')
  if (!year || !quarter) return null
  const disclosed = cells[header.indexOf('disclosure_code')] !== 'N'
  const employment = disclosed ? num('month3_emplvl') : null
  const employmentChange = num('oty_month3_emplvl_chg')
  const wage = disclosed ? num('avg_wkly_wage') : null
  const wageChange = num('oty_avg_wkly_wage_chg')
  return {
    year,
    quarter,
    disclosed,
    employment,
    employmentYearAgo: employment !== null && employmentChange !== null ? employment - employmentChange : null,
    avgWeeklyWage: wage,
    avgWeeklyWageYearAgo: wage !== null && wageChange !== null ? wage - wageChange : null,
  }
}

/** QCEW publishes about five to six months after a quarter ends; newest plausible quarter first. */
export function qcewCandidateQuarters(today: string): { year: number; quarter: number }[] {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - 5)
  let year = d.getUTCFullYear()
  let quarter = Math.floor(d.getUTCMonth() / 3) + 1
  const out: { year: number; quarter: number }[] = []
  for (let i = 0; i < 3; i++) {
    out.push({ year, quarter })
    quarter -= 1
    if (quarter === 0) {
      quarter = 4
      year -= 1
    }
  }
  return out
}

export function loadQcewCounty(fips: string, today: string, deps: HttpDeps): Promise<QcewCounty | null> {
  if (!/^\d{5}$/.test(fips)) return Promise.resolve(null)
  return cached(deps, `qcew:${fips}:${today.slice(0, 7)}`, 12 * HOUR, async () => {
    for (const { year, quarter } of qcewCandidateQuarters(today)) {
      const url = qcewUrl(year, quarter, fips)
      const res = await fetchWithRetry(url, { headers: { Accept: 'text/csv' } }, deps)
      if (res.status === 404) continue
      if (!res.ok) throw new Error(`QCEW responded ${res.status}`)
      const parsed = parseQcewCsv(await res.text(), fips)
      if (parsed) return { ...parsed, url }
      return null
    }
    return null
  })
}

// ---------- Census Building Permits Survey (monthly place and county files) ----------

export type PermitCounts = { singleFamilyUnits: number; totalUnits: number }
export type BpsFile = { kind: 'county' } | { kind: 'place'; region: CensusRegion }

const REGION_PREFIX: Record<CensusRegion, string> = { Northeast: 'ne', Midwest: 'mw', South: 'so', West: 'we' }

export function bpsUrl(file: BpsFile, yymm: string) {
  return file.kind === 'county'
    ? `https://www2.census.gov/econ/bps/County/co${yymm}c.txt`
    : `https://www2.census.gov/econ/bps/Place/${file.region}%20Region/${REGION_PREFIX[file.region]}${yymm}c.txt`
}

/** Calendar months before today as yymm, newest first. */
export function bpsCandidateMonths(today: string, count = 3): string[] {
  const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
  return Array.from({ length: count }, () => {
    d.setUTCMonth(d.getUTCMonth() - 1)
    return `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

export const priorYearMonth = (yymm: string) => `${String(Number(yymm.slice(0, 2)) - 1).padStart(2, '0')}${yymm.slice(2)}`

/**
 * Finds the rows for one county ("county" file) or one Census place ("place" file) and sums permit units.
 * Columns are located from the "Name" header so a new column before it does not shift the counts.
 */
export function parseBpsFile(text: string, file: BpsFile, ids: { stateFips: string; county?: string; place?: string }): PermitCounts | null {
  const lines = text.split(/\r?\n/)
  if (!/^Survey,/.test(lines[0] ?? '')) return null
  const sub = (lines[1] ?? '').split(',').map((h) => h.trim())
  const nameCol = sub.indexOf('Name')
  if (nameCol < 0) return null
  const state = Number(ids.stateFips)
  const sum: PermitCounts = { singleFamilyUnits: 0, totalUnits: 0 }
  let matched = false
  for (const line of lines.slice(2)) {
    const c = line.split(',').map((v) => v.trim())
    if (!/^\d{6}$/.test(c[0] ?? '') || Number(c[1]) !== state) continue
    const match = file.kind === 'county' ? Number(c[2]) === Number(ids.county) : !!ids.place && c[5] === ids.place
    if (!match) continue
    const units = [2, 5, 8, 11].map((offset) => Number(c[nameCol + offset]))
    if (units.some((u) => !Number.isFinite(u) || u < 0)) continue
    matched = true
    sum.singleFamilyUnits += units[0]
    sum.totalUnits += units.reduce((a, b) => a + b, 0)
  }
  return matched ? sum : null
}

type FileResult = { status: 'missing' } | { status: 'ok'; counts: PermitCounts | null }

function loadBpsFile(file: BpsFile, yymm: string, ids: { stateFips: string; county?: string; place?: string }, deps: HttpDeps): Promise<FileResult> {
  const key = `bps:${bpsUrl(file, yymm)}:${ids.stateFips}:${ids.county ?? ''}:${ids.place ?? ''}`
  return cached(deps, key, 12 * HOUR, async (): Promise<FileResult> => {
    const res = await fetchWithRetry(bpsUrl(file, yymm), { headers: { Accept: 'text/plain' } }, deps)
    if (res.status === 404) return { status: 'missing' }
    if (!res.ok) throw new Error(`Census BPS responded ${res.status}`)
    const text = await res.text()
    // Census returns an HTML "Request Rejected" page with status 200 when it throttles a client.
    if (!/^Survey,/.test(text)) throw new Error('Census BPS rejected the request')
    return { status: 'ok', counts: parseBpsFile(text, file, ids) }
  })
}

export type PermitObservation = {
  yymm: string
  latest: PermitCounts
  yearAgo: PermitCounts | null
  url: string
}

/** Newest published month for one county or place, plus the same month a year earlier when available. */
export async function loadBpsPermits(
  file: BpsFile,
  ids: { stateFips: string; county?: string; place?: string },
  today: string,
  deps: HttpDeps,
): Promise<PermitObservation | null> {
  for (const yymm of bpsCandidateMonths(today)) {
    const latest = await loadBpsFile(file, yymm, ids, deps)
    if (latest.status === 'missing') continue
    if (!latest.counts) return null
    const prior = await loadBpsFile(file, priorYearMonth(yymm), ids, deps).catch(() => null)
    return {
      yymm,
      latest: latest.counts,
      yearAgo: prior?.status === 'ok' ? prior.counts : null,
      url: bpsUrl(file, yymm),
    }
  }
  return null
}

// ---------- FRED (optional) ----------

const FRED_API = 'https://api.stlouisfed.org/fred'
export const FRED_SERIES_ID = /^[A-Z0-9]{3,20}$/
export const fredSeriesUrl = (id: string) => `https://fred.stlouisfed.org/series/${id}`

/** Validated observations, newest first. FRED marks missing values with ".", which are skipped. */
export function parseFredObservations(json: unknown): Point[] | null {
  const list = (json as { observations?: unknown } | null)?.observations
  if (!Array.isArray(list)) return null
  const rows: Point[] = []
  for (const o of list as { date?: unknown; value?: unknown }[]) {
    const value = typeof o?.value === 'string' && o.value.trim() !== '' && o.value !== '.' ? Number(o.value) : Number.NaN
    if (typeof o?.date === 'string' && DATE.test(o.date) && !Number.isNaN(Date.parse(o.date)) && Number.isFinite(value)) {
      rows.push({ date: o.date, value, preliminary: false })
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

export function loadFredSeries(id: string, apiKey: string, deps: HttpDeps): Promise<Point[]> {
  if (!FRED_SERIES_ID.test(id)) return Promise.reject(new Error('invalid series id'))
  return cached(deps, `fred:${id}`, 6 * HOUR, async () => {
    const qs = new URLSearchParams({ series_id: id, api_key: apiKey, file_type: 'json', sort_order: 'desc', limit: '60' })
    const res = await fetchWithRetry(`${FRED_API}/series/observations?${qs}`, { headers: { Accept: 'application/json' } }, deps)
    if (!res.ok) throw new Error(`FRED responded ${res.status}`)
    const rows = parseFredObservations(await res.json())
    if (!rows?.length) throw new Error('no valid observations')
    return rows
  })
}
