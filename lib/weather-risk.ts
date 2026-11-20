/**
 * Jobsite weather warnings: which scheduled work is sensitive to which weather, and whether the forecast threatens it.
 * Pure (no network) so it is unit-tested; the dashboard route supplies the forecast and schedule.
 */
import { windStringMph, type WeatherDay } from './weather.ts'

export type Hazard = 'rain' | 'freeze' | 'wind'

/** Work that weather can stop or ruin, recognised from the activity name. Order matters: first match labels it. */
const WORK_RULES: { label: string; re: RegExp; hazards: Hazard[] }[] = [
  { label: 'Concrete', re: /concrete|\bpour|slab|footing|foundation|flatwork|driveway|sidewalk|patio|curb/i, hazards: ['rain', 'freeze'] },
  { label: 'Roofing', re: /roof|shingle|underlayment|gutter/i, hazards: ['rain', 'wind'] },
  { label: 'Exterior finish', re: /exterior paint|paint exterior|stucco|siding|masonry|brick|stone veneer|sealant|caulk exterior/i, hazards: ['rain', 'freeze'] },
  { label: 'Earthwork', re: /grading|excavat|trench|site ?work|backfill|soil|drainage|land ?clearing|clearing/i, hazards: ['rain'] },
  { label: 'Framing', re: /framing|truss|sheathing|frame/i, hazards: ['wind', 'rain'] },
  { label: 'Crane / lift', re: /crane|\blift\b|hoist/i, hazards: ['wind'] },
  { label: 'Landscaping', re: /landscap|sod|irrigation|fence|deck/i, hazards: ['rain', 'freeze'] },
]

/** Indoor trades, paperwork and inspections mentioned alongside outdoor words ("Rough plumbing under foundation"). */
const NOT_OUTDOOR = /plumb|electric|hvac|mechanical|inspect|design|permit|procure|order|bid|survey|drawing|interior|insulation|drywall|cabinet|tile|floor/i

export function sensitiveWork(activityName: string): { label: string; hazards: Hazard[] } | null {
  if (NOT_OUTDOOR.test(activityName)) return null
  const rule = WORK_RULES.find((r) => r.re.test(activityName))
  return rule ? { label: rule.label, hazards: rule.hazards } : null
}

export const RAIN_THRESHOLD = 50
export const WIND_THRESHOLD_MPH = 25
export const FREEZE_F = 32

/** The hazards a forecast day carries, with the number shown to the builder. */
export function dayHazards(day: Pick<WeatherDay, 'rainChance' | 'kind' | 'low' | 'wind'>): Partial<Record<Hazard, number>> {
  const out: Partial<Record<Hazard, number>> = {}
  if ((day.rainChance ?? 0) >= RAIN_THRESHOLD || day.kind === 'storm') out.rain = day.rainChance ?? 0
  if (day.low !== null && day.low <= FREEZE_F) out.freeze = day.low
  const wind = windStringMph(day.wind)
  if (wind !== null && wind >= WIND_THRESHOLD_MPH) out.wind = wind
  return out
}

export type ActivityWindow = { name: string; start: string | null; end: string | null }

export type WeatherAlert = {
  projectId: string
  projectName: string
  date: string
  dayLabel: string
  hazard: Hazard
  /** "Rain 70%", "Low 28°F", "Wind 30 mph". */
  detail: string
  /** The scheduled work at risk, e.g. "Pour driveway". */
  activities: string[]
}

const HAZARD_ORDER: Record<Hazard, number> = { freeze: 0, rain: 1, wind: 2 }

function detailFor(h: Hazard, value: number) {
  return h === 'rain' ? `Rain ${value}%` : h === 'freeze' ? `Low ${value}°F` : `Wind ${value} mph`
}

/** Activities scheduled on `date` (by planned dates; open-ended ones run one day). */
function onDate(a: ActivityWindow, date: string) {
  if (!a.start) return false
  const end = a.end ?? a.start
  return a.start <= date && date <= end
}

export function buildWeatherAlerts(
  projects: { id: string; name: string; days: Pick<WeatherDay, 'date' | 'label' | 'rainChance' | 'kind' | 'low' | 'wind'>[]; activities: ActivityWindow[] }[],
): WeatherAlert[] {
  const alerts: WeatherAlert[] = []
  for (const p of projects) {
    for (const day of p.days) {
      const hazards = dayHazards(day)
      for (const h of Object.keys(hazards) as Hazard[]) {
        const atRisk = p.activities.filter((a) => onDate(a, day.date) && sensitiveWork(a.name)?.hazards.includes(h)).map((a) => a.name)
        if (!atRisk.length) continue
        alerts.push({
          projectId: p.id,
          projectName: p.name,
          date: day.date,
          dayLabel: day.label,
          hazard: h,
          detail: detailFor(h, hazards[h]!),
          activities: [...new Set(atRisk)],
        })
      }
    }
  }
  return alerts.sort((a, b) => a.date.localeCompare(b.date) || HAZARD_ORDER[a.hazard] - HAZARD_ORDER[b.hazard] || a.projectName.localeCompare(b.projectName))
}
