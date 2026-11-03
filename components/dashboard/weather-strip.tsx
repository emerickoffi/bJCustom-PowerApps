'use client'

import { useState, useTransition } from 'react'
import useSWR from 'swr'
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSun,
  MapPin,
  Snowflake,
  Sun,
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
import { WEATHER_STALE_MS, type WeatherKind, type WeatherResult } from '@/lib/weather'
import { cn } from '@/lib/utils'

export type WeatherLocation = { id: string; name: string }

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

const fetcher = async (url: string): Promise<WeatherResult> => {
  const res = await fetch(url)
  if (!res.ok)
    return {
      state: 'unavailable',
      message: 'Weather could not be loaded for this jobsite.',
    }
  return res.json()
}

const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
})
const fmtTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : null)
const deg = (n: number | null) => (n === null ? '\u2014' : `${n}\u00B0F`)

export function WeatherStrip({
  locations,
  initialLocationId,
  compact = false,
}: {
  locations: WeatherLocation[]
  initialLocationId: string | null
  /** Standard dashboard header: icon, temperature and location only; details live in the forecast dialog. */
  compact?: boolean
}) {
  const [locationId, setLocationId] = useState(
    initialLocationId && locations.some((l) => l.id === initialLocationId) ? initialLocationId : null,
  )
  const [, startTransition] = useTransition()
  const { data, error, isLoading } = useSWR(locationId ? `/api/weather?project=${locationId}` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
    refreshInterval: 30 * 60 * 1000,
  })

  const choose = (id: string) => {
    const next = id || null
    setLocationId(next)
    startTransition(async () => {
      await setWeatherLocationAction(next)
    })
  }

  const selector =
    locations.length > 0 ? (
      <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
        <span className="sr-only">Weather location (does not filter the dashboard)</span>
        <select
          value={locationId ?? ''}
          onChange={(e) => choose(e.target.value)}
          className={cn(
            'truncate rounded-md border border-input bg-background px-1.5 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'h-9 max-w-[14rem] font-medium' : 'h-7 max-w-[11rem]',
          )}
        >
          <option value="">Set weather location</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
    ) : null

  const shell = 'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#D6DDE5] bg-card px-3 py-2'

  if (locations.length === 0) {
    return (
      <div className={shell}>
        <p className="text-xs text-muted-foreground">
          Weather unavailable: no active project has a complete jobsite address.
        </p>
      </div>
    )
  }

  if (!locationId) {
    return (
      <div className={shell}>
        <Cloud className="size-4 text-muted-foreground" aria-hidden="true" />
        {selector}
      </div>
    )
  }

  if (isLoading || (!data && !error)) {
    return (
      <div className={shell} aria-busy="true">
        <span className="h-4 w-40 animate-pulse rounded bg-muted" />
        <span className="sr-only">Loading jobsite weather</span>
        {selector}
      </div>
    )
  }

  if (!data || data.state !== 'ok') {
    return (
      <div className={shell}>
        <p role="status" className="text-xs text-muted-foreground">
          {data && 'message' in data ? data.message : 'Weather could not be loaded for this jobsite.'}
        </p>
        {selector}
      </div>
    )
  }

  const current = data.current
  const Icon = ICONS[current?.kind ?? data.days[0]?.kind ?? 'cloudy']
  const tone = ICON_TONE[current?.kind ?? 'cloudy']
  const stale =
    data.stale || (data.updatedAt ? Date.now() - new Date(data.updatedAt).getTime() > WEATHER_STALE_MS : false)
  const observedLabel = `${current?.source === 'forecast' ? 'Forecast' : 'Observed'}${
    fmtTime(current?.at ?? data.updatedAt) ? ` ${fmtTime(current?.at ?? data.updatedAt)}` : ''
  }${stale ? ' \u00B7 may be out of date' : ''}`

  if (compact) {
    return (
      <div className={shell}>
        <Dialog>
          <DialogTrigger
            className="flex min-h-9 items-center gap-1.5 rounded-md px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label={`Jobsite weather for ${data.locationLabel}: ${current ? deg(current.temperatureF) : 'temperature unavailable'}, ${current?.condition ?? 'current conditions unavailable'}. Open details and 3-day forecast`}
          >
            <Icon className={cn('size-5 shrink-0', tone)} aria-hidden="true" />
            <span className="font-semibold tabular-nums text-foreground">
              {current ? deg(current.temperatureF) : '\u2014'}
            </span>
            {stale && <span className="text-xs text-muted-foreground">(may be out of date)</span>}
          </DialogTrigger>
          <ForecastDialog
            data={data}
            now={{
              condition: current?.condition ?? 'Current conditions unavailable',
              rain: data.rainChanceToday === null ? '\u2014' : `${data.rainChanceToday}%`,
              wind:
                current?.windMph === null || current?.windMph === undefined ? '\u2014' : `${current.windMph} mph`,
              observed: observedLabel,
            }}
          />
        </Dialog>
        {selector}
      </div>
    )
  }

  return (
    <div className={shell}>
      <Dialog>
        <DialogTrigger
          className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-md text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Jobsite weather for ${data.locationLabel}. Open 3-day forecast`}
        >
          <span className="flex items-center gap-1.5">
            <Icon className={cn('size-5 shrink-0', tone)} aria-hidden="true" />
            <span className="font-semibold tabular-nums text-foreground">
              {current ? deg(current.temperatureF) : '\u2014'}
            </span>
            <span className="text-foreground">{current?.condition ?? 'Current conditions unavailable'}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            {'Rain chance today '}
            <span className="font-medium tabular-nums text-foreground">
              {data.rainChanceToday === null ? '\u2014' : `${data.rainChanceToday}%`}
            </span>
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wind className="size-3.5" aria-hidden="true" />
            <span className="tabular-nums">
              {current?.windMph === null || current?.windMph === undefined ? '\u2014' : `${current.windMph} mph`}
            </span>
          </span>
        </DialogTrigger>
        <ForecastDialog data={data} />
      </Dialog>
      <span className="text-xs text-muted-foreground">
        {current?.source === 'forecast' ? 'Forecast' : 'Observed'}
        {fmtTime(current?.at ?? data.updatedAt) ? ` ${fmtTime(current?.at ?? data.updatedAt)}` : ''}
        {stale ? ' \u00B7 may be out of date' : ''}
      </span>
      {selector}
    </div>
  )
}

function ForecastDialog({
  data,
  now,
}: {
  data: Extract<WeatherResult, { state: 'ok' }>
  now?: { condition: string; rain: string; wind: string; observed: string }
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>3-day jobsite forecast</DialogTitle>
        <DialogDescription>
          {`${data.locationLabel}. Forecasts are predictions, not recorded conditions.`}
        </DialogDescription>
      </DialogHeader>
      {now && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border px-3 py-2.5 text-xs">
          <dt className="text-muted-foreground">Now</dt>
          <dd className="text-right text-foreground">{now.condition}</dd>
          <dt className="text-muted-foreground">Rain chance today</dt>
          <dd className="text-right tabular-nums text-foreground">{now.rain}</dd>
          <dt className="text-muted-foreground">Wind</dt>
          <dd className="text-right tabular-nums text-foreground">{now.wind}</dd>
          <dt className="text-muted-foreground">Reading</dt>
          <dd className="text-right text-foreground">{now.observed}</dd>
        </dl>
      )}
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
