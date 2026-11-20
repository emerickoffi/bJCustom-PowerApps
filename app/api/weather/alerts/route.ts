import { NextResponse } from 'next/server'
import { todayIso } from '@/lib/schedule'
import { addDaysIso } from '@/lib/time-tracking'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getJobsiteWeather } from '@/lib/weather-data'
import { buildWeatherAlerts, sensitiveWork, type ActivityWindow } from '@/lib/weather-risk'
import { ACTIVE_PROJECT_STATUSES } from '@/lib/domain'

export const dynamic = 'force-dynamic'

const MAX_PROJECTS = 8

/**
 * Dashboard warnings: rain, freezing temperatures or high wind forecast on a day when weather-sensitive work
 * (concrete, roofing, earthwork…) is scheduled at an active jobsite the viewer can see. Next 3 days.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.organizationId || !session.role || session.role === 'client') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = todayIso()
  const horizon = addDaysIso(today, 3)
  const supabase = await createClient()

  const { data: activities } = await supabase
    .from('schedule_activities')
    .select('project_id, name, planned_start, planned_end, status')
    .eq('organization_id', session.organizationId)
    .not('planned_start', 'is', null)
    .lte('planned_start', horizon)
    .not('status', 'in', '(completed,cancelled)')
    .limit(1000)

  const byProject = new Map<string, ActivityWindow[]>()
  for (const a of activities ?? []) {
    const end = (a.planned_end as string | null) ?? (a.planned_start as string)
    if (end < today || !sensitiveWork(a.name as string)) continue
    const list = byProject.get(a.project_id as string) ?? []
    list.push({ name: a.name as string, start: a.planned_start as string, end })
    byProject.set(a.project_id as string, list)
  }
  if (!byProject.size) return NextResponse.json({ alerts: [] }, { headers: { 'Cache-Control': 'private, max-age=900' } })

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, address_line1, city, state, postal_code, country')
    .eq('organization_id', session.organizationId)
    .is('archived_at', null)
    .in('id', [...byProject.keys()].slice(0, 100))
  const candidates = (projects ?? [])
    .filter((p) => (ACTIVE_PROJECT_STATUSES as readonly string[]).includes(p.status as string))
    .slice(0, MAX_PROJECTS)

  const withWeather = await Promise.all(
    candidates.map(async (p) => {
      const weather = await getJobsiteWeather(p, today)
      return weather.state === 'ok' ? { id: p.id as string, name: p.name as string, days: weather.days, activities: byProject.get(p.id as string) ?? [] } : null
    }),
  )
  const alerts = buildWeatherAlerts(withWeather.filter((x): x is NonNullable<typeof x> => x !== null))
  return NextResponse.json({ alerts }, { headers: { 'Cache-Control': 'private, max-age=900' } })
}
