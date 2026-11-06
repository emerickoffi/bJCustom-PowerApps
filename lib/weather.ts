/** Jobsite weather from the U.S. National Weather Service (api.weather.gov). Pure helpers shared by server and client. */

export type WeatherKind = 'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog' | 'wind'

export type WeatherDay = {
  date: string
  label: string
  high: number | null
  low: number | null
  condition: string
  kind: WeatherKind
  rainChance: number | null
  wind: string | null
}

export type WeatherCurrent = {
  /** `observation` is a measured reading; `forecast` is the nearest hourly forecast when no recent reading exists. */
  source: 'observation' | 'forecast'
  at: string
  temperatureF: number | null
  condition: string
  kind: WeatherKind
  windMph: number | null
}

export type WeatherUnavailableReason =
  'no_address' | 'unresolved' | 'ambiguous' | 'unsupported' | 'unavailable' | 'rate_limited'

export type WeatherResult =
  | {
      state: 'ok'
      /** `device` = the viewer's current position; `jobsite` = a project's jobsite address; `place` = a typed city/ZIP. */
      source?: 'device' | 'jobsite' | 'place'
      locationLabel: string
      current: WeatherCurrent | null
      rainChanceToday: number | null
      days: WeatherDay[]
      /** When NWS last generated the forecast. */
      updatedAt: string | null
      /** When this app fetched it. */
      fetchedAt: string
      stale: boolean
    }
  | { state: WeatherUnavailableReason; message: string }

export const WEATHER_MESSAGES: Record<WeatherUnavailableReason, string> = {
  no_address: 'This project has no complete jobsite address.',
  unresolved: 'The jobsite address could not be located.',
  ambiguous: 'The jobsite address matched more than one location.',
  unsupported: 'Weather is available for U.S. jobsites only.',
  unavailable: 'The weather service did not respond. Try again shortly.',
  rate_limited: 'The weather service is busy. Try again in a few minutes.',
}

/** A fixed weather location: an active project's jobsite or a typed U.S. city / ZIP. */
export type FixedWeatherChoice = { mode: 'project'; projectId: string } | { mode: 'place'; query: string }

/**
 * An explicitly chosen weather location. Absent means first use, which defaults to the device location.
 * Device mode may carry the last fixed location so weather still shows when the device cannot be located.
 */
export type WeatherChoice = { mode: 'device'; fallback?: FixedWeatherChoice } | FixedWeatherChoice

export const PLACE_QUERY_MAX = 60

/** Trims and validates a typed city or ZIP ("Austin, TX", "30301"). Returns null when unusable. */
export function normalizePlaceQuery(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const q = input.replace(/\s+/g, ' ').trim()
  if (q.length < 2 || q.length > PLACE_QUERY_MAX) return null
  if (!/^[\p{L}\p{N} .,'-]+$/u.test(q)) return null
  return q
}

/** Forecasts older than this are flagged as stale. */
export const WEATHER_STALE_MS = 3 * 60 * 60 * 1000

export function weatherKind(text: string): WeatherKind {
  const t = text.toLowerCase()
  if (/thunder|t-storm/.test(t)) return 'storm'
  if (/snow|sleet|flurr|ice|freezing|blizzard/.test(t)) return 'snow'
  if (/rain|shower|drizzle/.test(t)) return 'rain'
  if (/fog|haze|smoke|mist/.test(t)) return 'fog'
  if (/wind|breezy|blustery/.test(t)) return 'wind'
  if (/partly|mostly sunny|mostly clear|few clouds/.test(t)) return 'partly_cloudy'
  if (/cloud|overcast/.test(t)) return 'cloudy'
  return 'clear'
}

export type NwsPeriod = {
  startTime: string
  isDaytime: boolean
  temperature: number | null
  temperatureUnit?: string
  windSpeed?: string | null
  windDirection?: string | null
  shortForecast: string
  probabilityOfPrecipitation?: { value: number | null } | null
}

const toF = (t: number | null, unit?: string) => (t === null ? null : unit === 'C' ? Math.round((t * 9) / 5 + 32) : t)

/** Local calendar date of an NWS ISO timestamp (the offset is the jobsite's own). */
const localDate = (iso: string) => iso.slice(0, 10)

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T12:00:00Z`))

/** Highest precipitation chance across today's remaining forecast periods. */
export function rainChanceFor(periods: NwsPeriod[], date: string): number | null {
  const values = periods
    .filter((p) => localDate(p.startTime) === date)
    .map((p) => p.probabilityOfPrecipitation?.value)
    .filter((v): v is number => typeof v === 'number')
  return values.length ? Math.max(...values) : null
}

/** The next `count` calendar days after `today`, each pairing its daytime high with that night's low. */
export function buildWeatherDays(periods: NwsPeriod[], today: string, count = 3): WeatherDay[] {
  const byDate = new Map<string, { day?: NwsPeriod; night?: NwsPeriod }>()
  for (const p of periods) {
    const date = localDate(p.startTime)
    if (date <= today) continue
    const entry = byDate.get(date) ?? {}
    if (p.isDaytime) entry.day ??= p
    else entry.night ??= p
    byDate.set(date, entry)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, count)
    .map(([date, { day, night }]) => {
      const lead = day ?? night!
      const chances = [day, night]
        .map((p) => p?.probabilityOfPrecipitation?.value)
        .filter((v): v is number => typeof v === 'number')
      return {
        date,
        label: dayLabel(date),
        high: day ? toF(day.temperature, day.temperatureUnit) : null,
        low: night ? toF(night.temperature, night.temperatureUnit) : null,
        condition: lead.shortForecast,
        kind: weatherKind(lead.shortForecast),
        rainChance: chances.length ? Math.max(...chances) : null,
        wind: lead.windSpeed ? [lead.windDirection, lead.windSpeed].filter(Boolean).join(' ') : null,
      }
    })
}

export const celsiusToF = (c: number | null | undefined) =>
  typeof c === 'number' ? Math.round((c * 9) / 5 + 32) : null
export const kmhToMph = (k: number | null | undefined) => (typeof k === 'number' ? Math.round(k * 0.621371) : null)

/** Leading number of an NWS wind string such as "5 to 10 mph". */
export const windStringMph = (s: string | null | undefined) => {
  const m = s?.match(/(\d+)(?:\s*to\s*(\d+))?/)
  return m ? Number(m[2] ?? m[1]) : null
}
