'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import {
  normalizePlaceQuery,
  PLACE_QUERY_MAX,
  WEATHER_STALE_MS,
  type FixedWeatherChoice,
  type WeatherChoice,
  type WeatherKind,
  type WeatherResult,
} from '@/lib/weather'
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

type GeoFailure = 'denied' | 'unavailable' | 'timeout'

/** Device position held in memory only, already coarsened to ~1 km before it leaves the browser. */
type GeoState =
  | { status: 'checking' }
  | { status: 'needs_permission' }
  | { status: 'locating' }
  | { status: 'ready'; lat: number; lon: number }
  | { status: GeoFailure }

type WeatherKey =
  | readonly ['weather', 'project', string]
  | readonly ['weather', 'place', string]
  | readonly ['weather', 'device', number, number]

/** Shown inside the location chooser only; the strip itself just says "Location unavailable". */
const GEO_REASONS: Record<GeoFailure, string> = {
  denied: 'Location access is blocked for this site in your browser settings.',
  unavailable: 'This device could not provide a location.',
  timeout: 'Finding your location took too long.',
}

/**
 * Remembers a failed device lookup for this browser tab session so reloading the dashboard does not keep re-running
 * a request that just failed. Any explicit "Use my location" press still tries again.
 */
const GEO_FAILED_KEY = 'dash-weather-geo-failed'
const readGeoFailed = (): GeoFailure | null => {
  try {
    const v = sessionStorage.getItem(GEO_FAILED_KEY)
    return v === 'denied' || v === 'unavailable' || v === 'timeout' ? v : null
  } catch {
    return null
  }
}
const writeGeoFailed = (v: GeoFailure | null) => {
  try {
    if (v) sessionStorage.setItem(GEO_FAILED_KEY, v)
    else sessionStorage.removeItem(GEO_FAILED_KEY)
  } catch {}
}

const coarse = (n: number) => Math.round(n * 100) / 100
const fixedValue = (f: FixedWeatherChoice) => (f.mode === 'project' ? f.projectId : `place:${f.query}`)
const placeKey = (query: string) => ['weather', 'place', query] as const

async function fetchWeather(key: WeatherKey): Promise<WeatherResult> {
  const res =
    key[1] === 'project'
      ? await fetch(`/api/weather?project=${encodeURIComponent(key[2])}`)
      : key[1] === 'place'
        ? await fetch(`/api/weather?place=${encodeURIComponent(key[2])}`)
        : await fetch('/api/weather', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: key[2], lon: key[3] }),
          })
  if (res.status === 404) return { state: 'unavailable', message: 'This project is no longer available to you.' }
  if (res.status === 400 && key[1] === 'place')
    return { state: 'unresolved', message: 'Enter a U.S. city (for example "Austin, TX") or a 5-digit ZIP code.' }
  if (!res.ok) return { state: 'unavailable', message: 'Weather could not be loaded. Try again shortly.' }
  return res.json()
}

const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : null)
const deg = (n: number | null) => (n === null ? '\u2014' : `${n}\u00B0F`)

const CHOOSE_PLACE = '__choose_place'

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
  const isValidFixed = (f: FixedWeatherChoice | null | undefined): f is FixedWeatherChoice =>
    !!f && (f.mode === 'place' || locations.some((l) => l.id === f.projectId))

  const restoredFixed = initialChoice && initialChoice.mode !== 'device' ? initialChoice : null
  const restoredFallback = initialChoice?.mode === 'device' ? initialChoice.fallback : undefined
  const [choice, setChoice] = useState<WeatherChoice>(
    isValidFixed(restoredFixed) ? restoredFixed : { mode: 'device' },
  )
  /** Last fixed location the user picked; shown whenever the device location can't be used. */
  const [lastFixed, setLastFixed] = useState<FixedWeatherChoice | null>(
    isValidFixed(restoredFixed) ? restoredFixed : isValidFixed(restoredFallback) ? restoredFallback : null,
  )
  const [savedUnavailable, setSavedUnavailable] = useState(!!restoredFixed && !isValidFixed(restoredFixed))
  const [geo, setGeo] = useState<GeoState>({ status: 'checking' })
  const [chooserOpen, setChooserOpen] = useState(false)
  const geoRequest = useRef(0)
  const [, startTransition] = useTransition()
  const { mutate: mutateKey } = useSWRConfig()

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
          writeGeoFailed(null)
          setGeo({ status: 'ready', lat, lon })
          if (fresh) void mutateKey(['weather', 'device', lat, lon] as const)
        },
        (err) => {
          if (id !== geoRequest.current) return
          const failure: GeoFailure =
            err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable'
          writeGeoFailed(failure)
          setGeo({ status: failure })
        },
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: fresh ? 0 : 30 * 60 * 1000 },
      )
    },
    [mutateKey],
  )

  /**
   * Only checks existing permission; the browser prompt is shown solely after an explicit "Use my location".
   * A lookup that already failed in this tab session is not re-run automatically.
   */
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
        if (perm.state === 'denied') setGeo({ status: 'denied' })
        else if (perm.state !== 'granted') setGeo({ status: 'needs_permission' })
        else {
          const failed = readGeoFailed()
          if (failed) setGeo({ status: failed })
          else locate(false)
        }
      })
      .catch(() => {
        if (!cancelled) setGeo({ status: 'needs_permission' })
      })
    return () => {
      cancelled = true
    }
  }, [choice.mode, geo.status, locate])

  const fallback = isValidFixed(lastFixed) ? lastFixed : null
  const showingFallback = choice.mode === 'device' && geo.status !== 'ready' && !!fallback
  const fixedTarget: FixedWeatherChoice | null = choice.mode !== 'device' ? choice : showingFallback ? fallback : null
  const project =
    fixedTarget?.mode === 'project' ? (locations.find((l) => l.id === fixedTarget.projectId) ?? null) : null

  const key: WeatherKey | null = fixedTarget
    ? fixedTarget.mode === 'place'
      ? placeKey(fixedTarget.query)
      : project?.hasAddress
        ? ['weather', 'project', project.id]
        : null
    : geo.status === 'ready'
      ? ['weather', 'device', geo.lat, geo.lon]
      : null

  const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetchWeather, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
    refreshInterval: 30 * 60 * 1000,
    shouldRetryOnError: false,
  })

  const save = (value: string, fallbackValue?: string | null) =>
    startTransition(async () => {
      await setWeatherLocationAction(value, fallbackValue)
    })

  const chooseFixed = (next: FixedWeatherChoice) => {
    setSavedUnavailable(false)
    if (geo.status === 'locating') {
      geoRequest.current++
      setGeo({ status: 'checking' })
    }
    setChoice(next)
    setLastFixed(next)
    save(fixedValue(next))
  }

  const selectMyLocation = () => {
    setSavedUnavailable(false)
    setChoice({ mode: 'device' })
    save('device', fallback ? fixedValue(fallback) : null)
    if (geo.status !== 'ready' && geo.status !== 'locating') locate(false)
  }

  const onSelect = (value: string) => {
    if (value === CHOOSE_PLACE) setChooserOpen(true)
    else if (value === 'device') selectMyLocation()
    else if (value.startsWith('place:')) chooseFixed({ mode: 'place', query: value.slice('place:'.length) })
    else chooseFixed({ mode: 'project', projectId: value })
  }

  const usingDevice = choice.mode === 'device' && !showingFallback
  const refresh = () => {
    if (usingDevice) locate(true)
    else void mutate()
  }

  const geoFailure: GeoFailure | null =
    geo.status === 'denied' || geo.status === 'unavailable' || geo.status === 'timeout' ? geo.status : null
  const busy = isValidating || geo.status === 'locating'
  const placeOption = lastFixed?.mode === 'place' ? lastFixed.query : null

  const selector = (
    <label className="flex h-10 min-w-0 cursor-pointer items-center gap-1.5 rounded-md border border-[#80C5CC] bg-[#E6F5F6] pl-2.5 text-xs font-medium text-[#006773] transition-colors hover:bg-[#CCECEF] has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-[#006773] has-[select:focus-visible]:ring-offset-1">
      <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Weather location (does not change the project or work filters)</span>
      <select
        value={choice.mode === 'device' ? 'device' : fixedValue(choice)}
        onChange={(e) => onSelect(e.target.value)}
        className={cn(
          'h-full min-w-0 cursor-pointer truncate rounded-r-md bg-transparent pr-2 text-xs font-medium text-[#006773] outline-none',
          compact ? 'max-w-[14rem]' : 'max-w-[12rem]',
        )}
      >
        <option value="device">My location</option>
        {placeOption && <option value={`place:${placeOption}`}>{placeOption}</option>}
        {locations.length > 0 && (
          <optgroup label="Active projects">
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.hasAddress ? l.name : `${l.name} (no jobsite address)`}
              </option>
            ))}
          </optgroup>
        )}
        <option value={CHOOSE_PLACE}>City or ZIP code{'\u2026'}</option>
      </select>
    </label>
  )

  const chooser = (
    <LocationChooser
      open={chooserOpen}
      onOpenChange={setChooserOpen}
      geoFailure={geoFailure}
      canUseDevice={typeof navigator === 'undefined' || 'geolocation' in navigator}
      initialQuery={placeOption ?? ''}
      onPlace={(query, result) => {
        void mutateKey(placeKey(query), result, { revalidate: false })
        chooseFixed({ mode: 'place', query })
        setChooserOpen(false)
      }}
      onUseDevice={() => {
        setChooserOpen(false)
        setSavedUnavailable(false)
        setChoice({ mode: 'device' })
        save('device', fallback ? fixedValue(fallback) : null)
        locate(true)
      }}
    />
  )

  const chooseButton = (label: string) => (
    <button
      type="button"
      onClick={() => setChooserOpen(true)}
      className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#006773] underline-offset-2 transition-colors hover:bg-[#E6F5F6] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006773]"
    >
      {label}
    </button>
  )

  const refreshButton = (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      aria-label={usingDevice ? 'Refresh location and weather' : 'Refresh weather'}
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
      {chooser}
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
      {chooser}
    </div>
  )

  if (choice.mode === 'device' && !showingFallback) {
    if (geo.status === 'checking') return loading('Checking location access')
    if (geo.status === 'locating') return loading('Finding your location')
    if (geo.status === 'needs_permission') {
      return (
        <div className={shell}>
          <button
            type="button"
            onClick={() => locate(false)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-primary/40 bg-background px-3 text-sm font-medium text-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            Use my location
          </button>
          {chooseButton('Enter city or ZIP')}
          {selector}
          {savedNote}
          {chooser}
        </div>
      )
    }
    if (geoFailure) {
      return (
        <div className={shell}>
          <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span role="status" className="text-xs font-medium text-foreground">
            Location unavailable
          </span>
          {chooseButton('Choose location')}
          {selector}
          {savedNote}
          {chooser}
        </div>
      )
    }
  } else if (fixedTarget?.mode === 'project' && !project) {
    return unavailable('Weather unavailable', 'This project is no longer available.', {})
  } else if (fixedTarget?.mode === 'project' && project && !project.hasAddress) {
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

  /** While "My location" is selected but can't be used, weather comes from the last chosen location. */
  const fallbackNote = !showingFallback ? null : geo.status === 'needs_permission' ? (
    <button
      type="button"
      onClick={() => locate(false)}
      className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#006773] transition-colors hover:bg-[#E6F5F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006773]"
    >
      <LocateFixed className="size-3.5" aria-hidden="true" />
      Use my location
    </button>
  ) : geoFailure ? (
    <button
      type="button"
      onClick={() => setChooserOpen(true)}
      className="inline-flex h-10 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-[#E6F5F6] hover:text-[#006773] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006773]"
    >
      <span role="status">Location unavailable</span>
      <span className="font-medium text-[#006773] underline underline-offset-2">Choose location</span>
    </button>
  ) : null

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
      {fallbackNote}
      {selector}
      {refreshButton}
      {chooser}
    </div>
  )
}

/** Manual city / ZIP entry, with "Use my location" as an optional action. Validates before saving. */
function LocationChooser({
  open,
  onOpenChange,
  geoFailure,
  canUseDevice,
  initialQuery,
  onPlace,
  onUseDevice,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  geoFailure: GeoFailure | null
  canUseDevice: boolean
  initialQuery: string
  onPlace: (query: string, result: WeatherResult) => void
  onUseDevice: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (pending) return
    const normalized = normalizePlaceQuery(query)
    if (!normalized) {
      setMessage('Enter a U.S. city (for example "Austin, TX") or a 5-digit ZIP code.')
      return
    }
    setPending(true)
    setMessage(null)
    try {
      const result = await fetchWeather(placeKey(normalized))
      if (result.state === 'ok') onPlace(normalized, result)
      else setMessage(result.message)
    } catch {
      setMessage('Weather could not be loaded. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setQuery(initialQuery)
          setMessage(null)
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Choose weather location</DialogTitle>
          <DialogDescription>
            {geoFailure
              ? `${GEO_REASONS[geoFailure]} Enter a city or ZIP code instead.`
              : 'Weather only. This does not change the project or work filters.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-2" noValidate>
          <label htmlFor="weather-place" className="text-sm font-medium text-foreground">
            City or ZIP code
          </label>
          <div className="flex gap-2">
            <Input
              id="weather-place"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Austin, TX or 78701"
              autoComplete="address-level2"
              maxLength={PLACE_QUERY_MAX}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? 'weather-place-message' : undefined}
              className="h-10"
              autoFocus
            />
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 shrink-0 items-center rounded-md bg-[#006773] px-3 text-sm font-medium text-white transition-colors hover:bg-[#00525C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006773] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Checking\u2026' : 'Show weather'}
            </button>
          </div>
          {message && (
            <p id="weather-place-message" role="alert" className="text-xs text-destructive">
              {message}
            </p>
          )}
        </form>
        {canUseDevice && geoFailure !== 'denied' && (
          <button
            type="button"
            onClick={onUseDevice}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[#80C5CC] bg-[#E6F5F6] px-3 text-sm font-medium text-[#006773] transition-colors hover:bg-[#CCECEF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006773]"
          >
            <LocateFixed className="size-4" aria-hidden="true" />
            {geoFailure ? 'Try my location again' : 'Use my location'}
          </button>
        )}
        <p className="text-xs text-muted-foreground">Active jobsites are also listed in the weather menu.</p>
      </DialogContent>
    </Dialog>
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
        <DialogTitle>
          {data.source === 'device'
            ? '3-day local forecast'
            : data.source === 'place'
              ? '3-day forecast'
              : '3-day jobsite forecast'}
        </DialogTitle>
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
