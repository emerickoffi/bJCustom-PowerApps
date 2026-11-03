import 'server-only'
import {
  buildWeatherDays,
  celsiusToF,
  kmhToMph,
  rainChanceFor,
  WEATHER_MESSAGES,
  WEATHER_STALE_MS,
  weatherKind,
  windStringMph,
  type NwsPeriod,
  type WeatherCurrent,
  type WeatherResult,
  type WeatherUnavailableReason,
} from '@/lib/weather'

export type JobsiteAddress = {
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country?: string | null
}

const NWS = 'https://api.weather.gov'
const NWS_HEADERS = {
  'User-Agent': '(bJCustom-PowerApps jobsite weather, https://github.com/emerickoffi/bJCustom-PowerApps)',
  Accept: 'application/geo+json',
}
/** Gridpoints and geocodes rarely change; forecasts refresh on the NWS cadence. */
const GEO_REVALIDATE = 60 * 60 * 24 * 7
const FORECAST_REVALIDATE = 60 * 30
const OBSERVATION_REVALIDATE = 60 * 10
const OBSERVATION_MAX_AGE_MS = 2 * 60 * 60 * 1000

class WeatherError extends Error {
  constructor(public reason: WeatherUnavailableReason) {
    super(reason)
  }
}

const fail = (reason: WeatherUnavailableReason): WeatherResult => ({
  state: reason,
  message: WEATHER_MESSAGES[reason],
})

/** `revalidate: null` bypasses the shared data cache (used for device-derived lookups). */
async function getJson<T>(
  url: string,
  revalidate: number | null,
  headers: Record<string, string> = NWS_HEADERS,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers,
      ...(revalidate === null ? { cache: 'no-store' as const } : { next: { revalidate } }),
      signal: AbortSignal.timeout(8000),
    })
  } catch {
    throw new WeatherError('unavailable')
  }
  if (res.status === 429) throw new WeatherError('rate_limited')
  if (res.status === 404) throw new WeatherError('unsupported')
  if (!res.ok) throw new WeatherError('unavailable')
  return (await res.json()) as T
}

export function formatJobsiteAddress(a: JobsiteAddress): string | null {
  const line1 = a.address_line1?.trim()
  const city = a.city?.trim()
  const state = a.state?.trim()
  const zip = a.postal_code?.trim()
  if (!line1 || !((city && state) || zip)) return null
  return [line1, [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].join(', ')
}

type CensusResponse = {
  result?: { addressMatches?: { coordinates: { x: number; y: number } }[] }
}

/** U.S. Census geocoder (public, keyless). Distinct matches more than ~1 km apart are treated as ambiguous. */
async function geocode(address: string): Promise<{ lat: number; lon: number }> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address)}`
  const data = await getJson<CensusResponse>(url, GEO_REVALIDATE, {
    Accept: 'application/json',
  })
  const matches = data.result?.addressMatches ?? []
  if (!matches.length) throw new WeatherError('unresolved')
  const [first] = matches
  const spread = matches.some(
    (m) =>
      Math.abs(m.coordinates.y - first.coordinates.y) > 0.01 || Math.abs(m.coordinates.x - first.coordinates.x) > 0.01,
  )
  if (spread) throw new WeatherError('ambiguous')
  return {
    lat: Number(first.coordinates.y.toFixed(4)),
    lon: Number(first.coordinates.x.toFixed(4)),
  }
}

type PointResponse = {
  properties: {
    forecast: string
    forecastHourly: string
    observationStations: string
    relativeLocation?: { properties?: { city?: string; state?: string } }
  }
}
type ForecastResponse = {
  properties: {
    updateTime?: string
    generatedAt?: string
    periods: NwsPeriod[]
  }
}
type StationsResponse = {
  features: { properties: { stationIdentifier: string } }[]
}
type ObservationResponse = {
  properties: {
    timestamp: string
    textDescription: string | null
    temperature: { value: number | null }
    windSpeed: { value: number | null }
  }
}

async function latestObservation(stationsUrl: string): Promise<WeatherCurrent | null> {
  try {
    const stations = await getJson<StationsResponse>(stationsUrl, GEO_REVALIDATE)
    const id = stations.features[0]?.properties.stationIdentifier
    if (!id) return null
    const obs = await getJson<ObservationResponse>(`${NWS}/stations/${id}/observations/latest`, OBSERVATION_REVALIDATE)
    const p = obs.properties
    const temperatureF = celsiusToF(p.temperature.value)
    if (Date.now() - Date.parse(p.timestamp) > OBSERVATION_MAX_AGE_MS || temperatureF === null) return null
    const condition = p.textDescription?.trim() || 'Observed conditions'
    return {
      source: 'observation',
      at: p.timestamp,
      temperatureF,
      condition,
      kind: weatherKind(condition),
      windMph: kmhToMph(p.windSpeed.value),
    }
  } catch {
    return null
  }
}

export async function getJobsiteWeather(address: JobsiteAddress, today: string): Promise<WeatherResult> {
  const country = address.country?.trim().toLowerCase()
  if (country && !['united states', 'usa', 'us', 'u.s.', 'united states of america'].includes(country))
    return fail('unsupported')
  const oneLine = formatJobsiteAddress(address)
  if (!oneLine) return fail('no_address')

  try {
    const point = await geocode(oneLine)
    const fallbackLabel = [address.city, address.state].filter(Boolean).join(', ')
    return await weatherAtPoint(point, today, { source: 'jobsite', label: fallbackLabel || null, cachePoint: true })
  } catch (error) {
    return fail(error instanceof WeatherError ? error.reason : 'unavailable')
  }
}

/** Rounded to ~1 km: enough for a forecast gridpoint, never a precise position. */
const coarse = (n: number) => Math.round(n * 100) / 100

/**
 * Weather at the user's device position. Coordinates are coarsened, used only for this request, and the
 * position lookup bypasses the shared cache so it is never stored server-side.
 */
export async function getDeviceWeather(lat: number, lon: number, today: string): Promise<WeatherResult> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    return fail('unresolved')
  try {
    return await weatherAtPoint({ lat: coarse(lat), lon: coarse(lon) }, today, {
      source: 'device',
      label: null,
      cachePoint: false,
    })
  } catch (error) {
    const reason = error instanceof WeatherError ? error.reason : 'unavailable'
    return reason === 'unsupported'
      ? { state: 'unsupported', message: 'Weather is available for U.S. locations only.' }
      : fail(reason)
  }
}

async function weatherAtPoint(
  { lat, lon }: { lat: number; lon: number },
  today: string,
  opts: { source: 'device' | 'jobsite'; label: string | null; cachePoint: boolean },
): Promise<WeatherResult> {
    const point = await getJson<PointResponse>(`${NWS}/points/${lat},${lon}`, opts.cachePoint ? GEO_REVALIDATE : null)
    const [forecast, hourly, observed] = await Promise.all([
      getJson<ForecastResponse>(point.properties.forecast, FORECAST_REVALIDATE),
      getJson<ForecastResponse>(point.properties.forecastHourly, FORECAST_REVALIDATE).catch(() => null),
      latestObservation(point.properties.observationStations),
    ])
    const periods = forecast.properties.periods ?? []
    const nextHour = hourly?.properties.periods[0]
    const current: WeatherCurrent | null =
      observed ??
      (nextHour
        ? {
            source: 'forecast',
            at: nextHour.startTime,
            temperatureF: nextHour.temperatureUnit === 'C' ? celsiusToF(nextHour.temperature) : nextHour.temperature,
            condition: nextHour.shortForecast,
            kind: weatherKind(nextHour.shortForecast),
            windMph: windStringMph(nextHour.windSpeed),
          }
        : null)
    const updatedAt = forecast.properties.updateTime ?? forecast.properties.generatedAt ?? null
    const rel = point.properties.relativeLocation?.properties
    const nearest = [rel?.city, rel?.state].filter(Boolean).join(', ')
    const locationLabel =
      opts.source === 'device'
        ? nearest
          ? `Near ${nearest}`
          : 'Your location'
        : opts.label || nearest || 'Jobsite'
    return {
      state: 'ok',
      source: opts.source,
      locationLabel,
      current,
      rainChanceToday: rainChanceFor(hourly?.properties.periods ?? periods, today) ?? rainChanceFor(periods, today),
      days: buildWeatherDays(periods, today),
      updatedAt,
      fetchedAt: new Date().toISOString(),
      stale: updatedAt ? Date.now() - Date.parse(updatedAt) > WEATHER_STALE_MS : false,
    }
}
