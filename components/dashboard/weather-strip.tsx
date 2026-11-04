'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  LocateFixed,
  MapPin,
  RefreshCw,
  Snowflake,
  Sun,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { setWeatherLocationAction } from '@/app/actions/dashboard-preferences'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { WEATHER_STALE_MS, type WeatherChoice, type WeatherKind, type WeatherResult } from '@/lib/weather'
import { cn } from '@/lib/utils'

export type WeatherLocation = { id: string; name: string; hasAddress: boolean }

const ICONS: Record<WeatherKind, LucideIcon> = {
  clear: Sun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
  snow: Snowflake,
  fog: CloudFog,
  wind: Wind,
}

const ICON_TONE: Record<WeatherKind, string> = {
  clear: 'text-[#B7791F]',
  partly_cloudy: 'text-[#B7791F]',
  cloudy: 'text-muted-foreground',
  rain: 'text-[#2B6CB0]',
  storm: 'text-[#6B46C1]',
  snow: 'text-[#2B6CB0]',
  fog: 'text-muted-foreground',
  wind: 'text-primary',
}

/** Device position held in memory only, already coarsened to ~1 km before it leaves the browser. */
type GeoState =
  | { status: 'checking' }
  | { status: 'needs_permission' }
  | { status: 'locating' }
  | { status: 'ready'; lat: number; lon: number }
  | { status: 'denied' | 'unavailable' | 'timeout' }

type WeatherKey = readonly ['weather', 'project', string] | readonly ['weather', 'device', number, number]

const GEO_MESSAGES = {
  denied: {
    title: 'Location access is off',
    detail: 'Location is blocked for this site. Allow it in your browser settings, or choose an active project.',
  },
  unavailable: {
    title: 'Location unavailable',
    detail: 'This device could not provide a location. Try again, or choose an active project.',
  },
  timeout: {
    title: 'Location timed out',
    detail: 'Finding your location took too long. Try again, or choose an active project.',
  },
} as const

const coarse = (n: number) => Math.round(n * 100) / 100

async function fetchWeather(key: WeatherKey): Promise<WeatherResult> {
  const res =
    key[1] === 'project'
      ? await fetch(`/api/weather?project=${encodeURIComponent(key[2])}`)
      : await fetch('/api/weather', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat: key[2], lon: key[3] }),
        })
  if (res.status === 404) return { state: 'unavailable', message: 'This project is no longer available to you.' }
  if (!res.ok) return { state: 'unavailable', message: 'Weather could not be loaded. Try again shortly.' }
  return res.json()
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : null)
const deg = (n: number | null) => (n === null ? '\u2014' : `${n}\u00B0F`)

export function WeatherStrip({
  locations,
  initialChoice,
  canEditAddress,
  compact = false,
}: {
  locations: WeatherLocation[]
  /** The saved explicit choice; null on first use, which defaults to My location. */
  initialChoice: WeatherChoice | null
  /** Whether the viewer may open the existing project edit page to fix a jobsite address. */
  canEditAddress: boolean
  /** Standard dashboard header: tighter layout; rain and wind move into the details dialog. */
  compact?: boolean
}) {
  const restoredProjectValid =
    initialChoice?.mode === 'project' && locations.some((l) => l.id === initialChoice.projectId)
  const [choice, setChoice] = useState<WeatherChoice>(
    restoredProjectValid ? initialChoice! : { mode: 'device' },
  )
  const [savedUnavailable, setSavedUnavailable] = useState(initialChoice?.mode === 'project' && !restoredProjectValid)
  const [geo, setGeo] = useState<GeoState>({ status: 'checking' })
  const geoRequest = useRef(0)
  const [, startTransition] = useTransition()
  const { mutate: mutateKey } = useSWRConfig()

  const project = choice.mode === 'project' ? locations.find((l) => l.id === choice.projectId) ?? null : null

  const locate = useCallback(
    (fresh: boolean) => {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        setGeo({ status: 'unavailable' })
        return
      }
      const id = ++geoRequest.current
      setGeo({ status: 'locating' })
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (id !== geoRequest.current) return
          const lat = coarse(pos.coords.latitude)
          const lon = coarse(pos.coords.longitude)
          setGeo({ status: 'ready', lat, lon })
          if (fresh) void mutateKey(['weather', 'device', lat, lon] as const)
        },
        (err) => {
          if (id !== geoRequest.current) return
          setGeo({ status: err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable' })
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: fresh ? 0 : 10 * 60 * 1000 },
      )
    },
    [mutateKey],
  )

  /** Only checks existing permission; the browser prompt is shown solely after the user presses "Use my location". */
  useEffect(() => {
    if (choice.mode !== 'device' || geo.status !== 'checking') return
    if (!('geolocation' in navigator)) {
      setGeo({ status: 'unavailable' })
      return
    }
    if (!navigator.permissions?.query) {
      setGeo({ status: 'needs_permission' })
      return
    }
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' })
      .then((perm) => {
        if (cancelled) return
        if (perm.state === 'granted') locate(false)
        else setGeo({ status: perm.state === 'denied' ? 'denied' : 'needs_permission' })
      })
      .catch(() => {
        if (!cancelled) setGeo({ status: 'needs_permission' })
      })
    return () => {
      cancelled = true
    }
  }, [choice.mode, geo.status, locate])

  const key: WeatherKey | null =
    choice.mode === 'project'
      ? project?.hasAddress
        ? ['weather', 'project', project.id]
        : null
      : geo.status === 'ready'
        ? ['weather', 'device', geo.lat, geo.lon]
        : null

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetchWeather, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
    refreshInterval: 30 * 60 * 1000,
  })

  const choose = (value: string) => {
    const next: WeatherChoice = value === 'device' ? { mode: 'device' } : { mode: 'project', projectId: value }
    setSavedUnavailable(false)
    if (next.mode === 'project' && geo.status === 'locating') {
      geoRequest.current++
      setGeo({ status: 'checking' })
    }
    setChoice(next)
    startTransition(async () => {
      await setWeatherLocationAction(value)
    })
  }

  const refresh = () => {
    if (choice.mode === 'device') locate(true)
    else void mutate()
  }

  const busy = isValidating || geo.status === 'locating'
  const selector = (
    <label className="flex h-10 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#80C5CC] bg-[#E6F5F6] pl-2.5 text-xs font-medium text-[#006773] transition-colors hover:bg-[#CCECEF] has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-[#006773] has-[select:focus-visible]:ring-offset-1">
      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Weather location (does not change the project or work filters)</span>
      <select
        value={choice.mode === 'device' ? 'device' : choice.projectId}
        onChange={(e) => choose(e.target.value)}
        className={cn(
          'h-full min-w-0 cursor-pointer truncate rounded-r-md bg-transparent pr-2 text-xs font-medium text-[#006773] outline-none',
          compact ? 'max-w-[14rem]' : 'max-w-[12rem]',
        )}
      >
        <option value="device">My location</option>
        {locations.length > 0 && (
          <optgroup label="Active projects">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.hasAddress ? l.name : `${l.name} (no jobsite address)`}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  )

  const refreshButton = (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      aria-label={choice.mode === 'device' ? 'Refresh location and weather' : 'Refresh weather'}
      className="flex size-10 shrink-0 items-center justify-center rounded-md text-[#006773] transition-colors hover:bg-[#E6F5F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006773] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <RefreshCw className={cn('size-4', busy && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
    </button>
  )

  const shell = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#D6DDE5] bg-card px-3 py-1.5'
  const savedNote = savedUnavailable ? (
    <p className="w-full text-xs text-muted-foreground">Your saved jobsite is no longer active or available.</p>
  ) : null

  const loading = (label: string) => (
    <div className={shell} aria-busy="true">
      <span className="h-4 w-28 animate-pulse rounded bg-muted" aria-hidden="true" />
      <span role="status" className="text-xs text-muted-foreground">
        {label}
      </span>
      {selector}
      {savedNote}
    </div>
  )

  const unavailable = (title: string, detail: string, actions: { retry?: boolean; editProjectId?: string }) => (
    <div className={shell}>
      <Cloud className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <Dialog>
        <DialogTrigger className="flex min-h-10 items-center gap-1.5 rounded-md px-1 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span role="status" className="font-medium text-foreground">
            {title}
          </span>
          <span className="text-muted-foreground underline underline-offset-2">Details</span>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{detail}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {actions.retry && (
              <button
                type="button"
                onClick={refresh}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Try again
              </button>
            )}
            {actions.editProjectId && canEditAddress && (
              <Link
                href={`/projects/${actions.editProjectId}/edit`}
                className="inline-flex h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Edit jobsite address
              </Link>
            )}
          </div>
          <p className="text-xs text-muted-foreground">You can also choose another location from the weather menu.</p>
        </DialogContent>
      </Dialog>
      {selector}
      {savedNote}
    </div>
  )

  if (choice.mode === 'device') {
    if (geo.status === 'checking') return loading('Checking location access')
    if (geo.status === 'locating') return loading('Finding your location')
    if (geo.status === 'needs_permission') {
      return (
        <div className={shell}>
          <button
            type="button"
            onClick={() => locate(false)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-primary/40 bg-background px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby="weather-location-hint"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            Use my location
          </button>
          <span id="weather-location-hint" className="text-xs text-muted-foreground">
            Shows local weather where you are.
          </span>
          {selector}
          {savedNote}
        </div>
      )
    }
    if (geo.status !== 'ready') {
      const msg = GEO_MESSAGES[geo.status]
      return unavailable(msg.title, msg.detail, { retry: geo.status !== 'denied' })
    }
  } else if (!project) {
    return unavailable('Weather unavailable', 'This project is no longer available.', {})
  } else if (!project.hasAddress) {
    return unavailable('Weather unavailable', `${project.name} has no complete jobsite address.`, {
      editProjectId: project.id,
    })
  }

  if (isLoading || (!data && !error)) return loading('Loading weather')

  if (error || !data || data.state !== 'ok') {
    const reason = data && data.state !== 'ok' ? data.state : 'unavailable'
    const addressIssue = reason === 'no_address' || reason === 'unresolved' || reason === 'ambiguous'
    return unavailable(
      'Weather unavailable',
      data && 'message' in data ? data.message : 'Weather could not be loaded. Try again shortly.',
      {
        retry: !addressIssue && reason !== 'unsupported',
        editProjectId: addressIssue && project ? project.id : undefined,
      },
    )
  }

  const current = data.current
  const kind = current?.kind ?? data.days[0]?.kind ?? 'cloudy'
  const Icon = ICONS[kind]
  const stale =
    data.stale || (data.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() > WEATHER_STALE_MS : false)
  const readingTime = fmtTime(current?.at ?? data.updatedAt)
  const observedLabel = `${current?.source === 'forecast' ? 'Forecast' : 'Observed'}${readingTime ? ` ${readingTime}` : ''}${
    stale ? ' \u00B7 may be out of date' : ''
  }`
  const condition = current?.condition ?? 'Current conditions unavailable'
  const rain = data.rainChanceToday === null ? '\u2014' : `${data.rainChanceToday}%`
  const wind = current?.windMph === null || current?.windMph === undefined ? '\u2014' : `${current.windMph} mph`

  return (
    <div className={shell}>
      <Dialog>
        <DialogTrigger
          className="flex min-h-10 min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md px-1 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Weather for ${data.locationLabel}: ${current ? deg(current.temperatureF) : 'temperature unavailable'}, ${condition}${stale ? ', may be out of date' : ''}. Open details and 3-day forecast`}
        >
          <Icon className={cn('size-5 shrink-0', ICON_TONE[kind])} aria-hidden="true" />
          <span className="font-bold tabular-nums text-[#17212B]">{current ? deg(current.temperatureF) : '\u2014'}</span>
          <span className="max-w-[10rem] truncate text-foreground">{condition}</span>
          <span className="max-w-[12rem] truncate text-xs text-muted-foreground">{data.locationLabel}</span>
          {!compact && (
            <span className="text-xs text-muted-foreground">
              {'Rain '}
              <span className="font-medium tabular-nums text-foreground">{rain}</span>
              {' \u00B7 Wind '}
              <span className="font-medium tabular-nums text-foreground">{wind}</span>
            </span>
          )}
          {stale && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8A4B08]">
              <TriangleAlert className="size-3.5 shrink-0 text-[#B45309]" aria-hidden="true" />
              May be out of date
            </span>
          )}
        </DialogTrigger>
        <ForecastDialog data={data} now={{ condition, rain, wind, observed: observedLabel }} />
      </Dialog>
      {selector}
      {refreshButton}
    </div>
  )
}

function ForecastDialog({
  data,
  now,
}: {
  data: Extract<WeatherResult, { state: 'ok' }>
  now: { condition: string; rain: string; wind: string; observed: string }
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{data.source === 'device' ? '3-day local forecast' : '3-day jobsite forecast'}</DialogTitle>
        <DialogDescription>
          {`${data.locationLabel}. Forecasts are predictions, not recorded conditions.`}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 text-xs">
        <dt className="text-muted-foreground">Now</dt>
        <dd className="text-right text-foreground">{now.condition}</dd>
        <dt className="text-muted-foreground">Rain chance today</dt>
        <dd className="text-right tabular-nums text-foreground">{now.rain}</dd>
        <dt className="text-muted-foreground">Wind</dt>
        <dd className="text-right tabular-nums text-foreground">{now.wind}</dd>
        <dt className="text-muted-foreground">Reading</dt>
        <dd className="text-right text-foreground">{now.observed}</dd>
        <dt className="text-muted-foreground">Last updated</dt>
        <dd className="text-right text-foreground">{fmtTime(data.fetchedAt) ?? '\u2014'}</dd>
      </dl>
      {data.days.length === 0 ? (
        <p className="text-sm text-muted-foreground">No forecast days are available right now.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {data.days.map((d) => {
            const DayIcon = ICONS[d.kind]
            return (
              <li key={d.date} className="flex items-center gap-3 px-3 py-2.5">
                <DayIcon className={cn('size-5 shrink-0', ICON_TONE[d.kind])} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium text-foreground">
                    <time dateTime={d.date}>{d.label}</time>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{d.condition}</span>
                </div>
                <div className="flex shrink-0 flex-col items-end text-xs text-muted-foreground">
                  <span className="tabular-nums text-foreground">
                    <span className="sr-only">High </span>
                    {deg(d.high)}
                    <span aria-hidden="true">{' / '}</span>
                    <span className="sr-only"> low </span>
                    {deg(d.low)}
                  </span>
                  <span className="tabular-nums">
                    {`Rain ${d.rainChance === null ? '\u2014' : `${d.rainChance}%`}`}
                    {d.wind ? ` \u00B7 ${d.wind}` : ''}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {`Data: U.S. National Weather Service (weather.gov).${data.updatedAt ? ` Forecast issued ${new Date(data.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}.` : ''}`}
      </p>
    </DialogContent>
  )
}
