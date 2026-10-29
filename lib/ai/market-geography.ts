/**
 * Location handling for market intelligence: free text to city/state, then city to its Census place,
 * county, and metropolitan area via the Census TIGERweb service. Only a place name and state code
 * leave the server; nothing about projects or customers is sent.
 */
import { cached, fetchWithRetry, HOUR, type HttpDeps } from './market-http.ts'

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

/** Official two-digit state FIPS codes. */
export const STATE_FIPS: Record<string, string> = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13',
  HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25',
  MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36',
  NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48',
  UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56',
}

/** Census regions, which determine the Building Permits Survey place file for a state. */
const REGION_STATES: Record<'Northeast' | 'Midwest' | 'South' | 'West', string> = {
  Northeast: 'CT ME MA NH RI VT NJ NY PA',
  Midwest: 'IL IN MI OH WI IA KS MN MO NE ND SD',
  South: 'DE DC FL GA MD NC SC VA WV AL KY MS TN AR LA OK TX',
  West: 'AZ CO ID MT NV NM UT WY AK CA HI OR WA',
}
export type CensusRegion = keyof typeof REGION_STATES

export function censusRegion(stateCode: string): CensusRegion | null {
  return (Object.keys(REGION_STATES) as CensusRegion[]).find((r) => REGION_STATES[r].split(' ').includes(stateCode)) ?? null
}

export type KnownPlace = { city?: string | null; state?: string | null; source?: 'project' | 'company' }

export type ResolvedLocation = {
  city: string | null
  stateCode: string | null
  /** Most specific place the user asked about, e.g. "Cedar Hill, Texas". */
  label: string
  /** Where the place came from: the question itself, the open project, or the company profile. */
  source: 'request' | 'project' | 'company' | 'none'
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
 * A bare city name, or a phrase like "our area", uses the known project/company place only when it matches.
 */
export function resolveLocation(text: string | null | undefined, known: KnownPlace = {}): ResolvedLocation {
  const raw = (text ?? '').trim().slice(0, 80)
  const knownState = known.state ? toStateCode(known.state) : null
  const knownCity = known.city?.trim() || null
  const build = (city: string | null, stateCode: string | null, source: ResolvedLocation['source'], note: string | null = null): ResolvedLocation =>
    stateCode
      ? { city, stateCode, label: city ? `${city}, ${US_STATES[stateCode]}` : US_STATES[stateCode], source, note }
      : { city: null, stateCode: null, label: 'United States', source, note }

  if (NATIONAL_WORDS.test(raw)) return build(null, null, 'request')
  if (!raw || LOCAL_WORDS.test(raw)) {
    return knownState
      ? build(knownCity ? titleCase(knownCity) : null, knownState, known.source ?? 'company')
      : build(null, null, 'none', 'No company or project location is on file, so national data is shown. Ask which city and state if local data matters.')
  }

  const whole = toStateCode(raw)
  if (whole) return build(null, whole, 'request')

  const comma = raw.match(/^(.+?),\s*([A-Za-z .]+)$/)
  const trailing = Object.entries(US_STATES)
    .map(([code, name]) => raw.match(new RegExp(`^(.+?)\\s+(${name}|${code})$`, 'i')) && { code, city: raw.replace(new RegExp(`\\s+(${name}|${code})$`, 'i'), '') })
    .find(Boolean)
  const city = comma ? comma[1] : trailing ? trailing.city : raw
  const stateCode = comma ? toStateCode(comma[2]) : trailing ? trailing.code : null
  if (stateCode) return build(titleCase(city), stateCode, 'request')

  if (knownState && knownCity && knownCity.toLowerCase() === city.toLowerCase()) return build(titleCase(city), knownState, known.source ?? 'company')
  return build(null, null, 'request', `The state for "${city}" was not given, so national data is shown. Ask which state if local data matters.`)
}

export type PlaceGeography = {
  status: 'resolved' | 'not_found' | 'ambiguous'
  place: { geoid: string; name: string } | null
  county: { fips: string; name: string } | null
  metro: { code: string; name: string } | null
}

const TIGERWEB = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_Current/MapServer'
const LAYER = { incorporatedPlaces: 28, censusDesignatedPlaces: 30, counties: 82, metroAreas: 93 } as const
const SAFE_CITY = /^[A-Za-z][A-Za-z .'-]{0,59}$/

type Attributes = Record<string, unknown>

async function queryLayer(layer: number, params: Record<string, string>, deps: HttpDeps): Promise<Attributes[]> {
  const qs = new URLSearchParams({ ...params, returnGeometry: 'false', f: 'json' })
  const res = await fetchWithRetry(`${TIGERWEB}/${layer}/query?${qs}`, { headers: { Accept: 'application/json' } }, deps)
  if (!res.ok) throw new Error(`TIGERweb responded ${res.status}`)
  const json = (await res.json()) as { error?: unknown; features?: { attributes?: Attributes }[] }
  if (json?.error || !Array.isArray(json?.features)) throw new Error('TIGERweb returned an error')
  return json.features.map((f) => f?.attributes ?? {})
}

const str = (a: Attributes, key: string) => (typeof a[key] === 'string' ? (a[key] as string).trim() : '')

/** Exported for tests: picks one place from TIGERweb features, or reports none/several. */
export function pickPlace(features: Attributes[], stateFips: string) {
  const places = new Map<string, { geoid: string; name: string; lat: number; lon: number }>()
  for (const a of features) {
    const geoid = str(a, 'GEOID')
    const lat = Number(str(a, 'INTPTLAT'))
    const lon = Number(str(a, 'INTPTLON'))
    if (!/^\d{7}$/.test(geoid) || geoid.slice(0, 2) !== stateFips) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue
    places.set(geoid, { geoid, name: str(a, 'NAME') || str(a, 'BASENAME'), lat, lon })
  }
  return [...places.values()]
}

/**
 * City to Census place, then the county and metropolitan area containing the place's internal point.
 * A city spanning several counties is assigned to the county containing that point, which is stated in notes.
 * Throws when the Census service cannot be reached, so the caller can fall back to state data.
 */
export function resolvePlaceGeography(city: string, stateCode: string, deps: HttpDeps): Promise<PlaceGeography> {
  const stateFips = STATE_FIPS[stateCode]
  const empty = { place: null, county: null, metro: null }
  if (!stateFips || !SAFE_CITY.test(city)) return Promise.resolve({ status: 'not_found', ...empty })
  return cached(deps, `geo:${stateCode}:${city.toLowerCase()}`, 24 * 7 * HOUR, async (): Promise<PlaceGeography> => {
    const where = `BASENAME='${city.replace(/'/g, "''")}' AND STATE='${stateFips}'`
    const fields = { where, outFields: 'GEOID,NAME,BASENAME,STATE,INTPTLAT,INTPTLON' }
    let matches = pickPlace(await queryLayer(LAYER.incorporatedPlaces, fields, deps), stateFips)
    if (!matches.length) matches = pickPlace(await queryLayer(LAYER.censusDesignatedPlaces, fields, deps), stateFips)
    if (!matches.length) return { status: 'not_found', ...empty }
    if (matches.length > 1) return { status: 'ambiguous', ...empty }
    const place = matches[0]
    const point = {
      geometry: `${place.lon},${place.lat}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
    }
    const [counties, metros] = await Promise.all([
      queryLayer(LAYER.counties, { ...point, outFields: 'GEOID,NAME,STATE,COUNTY' }, deps),
      queryLayer(LAYER.metroAreas, { ...point, outFields: 'GEOID,NAME,CBSA' }, deps),
    ])
    const county = counties.map((a) => ({ fips: str(a, 'GEOID'), name: str(a, 'NAME') })).find((c) => /^\d{5}$/.test(c.fips) && c.fips.startsWith(stateFips) && c.name)
    const metro = metros.map((a) => ({ code: str(a, 'CBSA') || str(a, 'GEOID'), name: str(a, 'NAME') })).find((m) => /^\d{5}$/.test(m.code) && m.name)
    return { status: 'resolved', place: { geoid: place.geoid, name: place.name }, county: county ?? null, metro: metro ?? null }
  })
}
