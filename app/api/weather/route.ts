import { NextResponse } from 'next/server'
import { isProjectId } from '@/lib/route-job'
import { todayIso } from '@/lib/schedule'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { normalizePlaceQuery } from '@/lib/weather'
import { getDeviceWeather, getJobsiteWeather, getPlaceWeather } from '@/lib/weather-data'

async function staffSession() {
  const session = await getSession()
  return session?.organizationId && session.role && session.role !== 'client' ? session : null
}

/** Weather for one project's jobsite. The project is re-read under RLS so only authorized jobsites resolve. */
export async function GET(request: Request) {
  const session = await staffSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const params = new URL(request.url).searchParams
  if (params.has('place')) {
    const query = normalizePlaceQuery(params.get('place'))
    if (!query) return NextResponse.json({ error: 'Invalid place' }, { status: 400 })
    const weather = await getPlaceWeather(query, todayIso())
    return NextResponse.json(weather, { headers: { 'Cache-Control': 'private, max-age=600' } })
  }
  const projectId = params.get('project')
  if (!isProjectId(projectId)) return NextResponse.json({ error: 'Invalid project' }, { status: 400 })

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, address_line1, city, state, postal_code, country')
    .eq('organization_id', session.organizationId)
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const weather = await getJobsiteWeather(project, todayIso())
  return NextResponse.json(weather, {
    headers: { 'Cache-Control': 'private, max-age=600' },
  })
}

/**
 * Weather at the viewer's device position. Coordinates arrive in the request body (never the URL, so they stay out
 * of request logs), are not logged or stored, and the response is not cached.
 */
export async function POST(request: Request) {
  const session = await staffSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { lat?: unknown; lon?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })
  }
  if (typeof body.lat !== 'number' || typeof body.lon !== 'number')
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 })

  const weather = await getDeviceWeather(body.lat, body.lon, todayIso())
  return NextResponse.json(weather, { headers: { 'Cache-Control': 'private, no-store' } })
}
