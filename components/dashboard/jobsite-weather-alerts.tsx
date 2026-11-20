'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { CloudRain, Snowflake, TriangleAlert, Wind, type LucideIcon } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { Hazard, WeatherAlert } from '@/lib/weather-risk'

const ICON: Record<Hazard, LucideIcon> = { rain: CloudRain, freeze: Snowflake, wind: Wind }

async function load(url: string): Promise<WeatherAlert[]> {
  const res = await fetch(url)
  if (!res.ok) return []
  return ((await res.json()) as { alerts?: WeatherAlert[] }).alerts ?? []
}

const work = (a: WeatherAlert) => (a.activities.length > 1 ? `${a.activities[0]} +${a.activities.length - 1}` : a.activities[0])

/**
 * "⚠ Rain 70% Tue at Yaupon Dr (Pour slab)": shown beside the dashboard weather only when the forecast threatens
 * weather-sensitive work on the schedule in the next 3 days. Nothing renders otherwise.
 */
export function JobsiteWeatherAlerts() {
  const { data } = useSWR('/api/weather/alerts', load, { revalidateOnFocus: false, refreshInterval: 30 * 60 * 1000 })
  const alerts = data ?? []
  if (!alerts.length) return null
  const first = alerts[0]

  return (
    <Dialog>
      <DialogTrigger
        className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-md px-2 text-left text-sm text-[#8A4B08] transition-colors hover:bg-champagne-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${alerts.length} jobsite weather ${alerts.length === 1 ? 'warning' : 'warnings'}. Open details`}
      >
        <TriangleAlert className="size-4 shrink-0 text-[#B45309]" aria-hidden="true" />
        <span className="truncate">
          <span className="font-semibold">{first.detail}</span> {first.dayLabel} at {first.projectName}
          <span className="text-muted-foreground"> ({work(first)})</span>
        </span>
        {alerts.length > 1 && <span className="shrink-0 font-medium underline underline-offset-2">+{alerts.length - 1} more</span>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Weather risks on the schedule</DialogTitle>
          <DialogDescription>
            Rain, freezing temperatures or high wind forecast on days with outdoor work in the next 3 days. Consider moving the work or
            letting the crew know.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-lg border">
          {alerts.map((a) => {
            const Icon = ICON[a.hazard]
            return (
              <li key={`${a.projectId}-${a.date}-${a.hazard}`}>
                <Link href={`/projects/${a.projectId}/schedule`} className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60">
                  <Icon className="mt-0.5 size-4 shrink-0 text-[#B45309]" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium text-foreground">
                      {a.detail} · {a.dayLabel} · {a.projectName}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{a.activities.join(', ')}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <p className="text-xs text-muted-foreground">Forecast: U.S. National Weather Service. Work is matched by activity name (concrete, roofing, grading…).</p>
      </DialogContent>
    </Dialog>
  )
}
