import { NextResponse, type NextRequest } from 'next/server'
import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getTeamMembers, getTimeProjects, listEntries } from '@/lib/time-tracking-data'
import { getOrgTimeZone } from '@/lib/daily-logs-data'
import { TIME_STATUSES, isIsoDate, timeEntriesCsv } from '@/lib/time-tracking'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Payroll export for managers: one row per entry, in the company's time zone. */
export async function GET(req: NextRequest) {
  const session = await requireManager()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.time_tracking) return new NextResponse('Time tracking is turned off.', { status: 403 })

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return new NextResponse('Choose a valid date range.', { status: 400 })
  if (Date.parse(to) - Date.parse(from) > 92 * 86400000) return new NextResponse('Export at most 92 days at a time.', { status: 400 })
  const status = sp.get('status') ?? undefined
  const person = sp.get('person') ?? undefined

  const timeZone = await getOrgTimeZone(session.organizationId)
  const [entries, team, projects] = await Promise.all([
    listEntries({
      organizationId: session.organizationId,
      from,
      to,
      timeZone,
      status: status && (TIME_STATUSES as readonly string[]).includes(status) ? status : undefined,
      userId: person && /^[0-9a-f-]{36}$/i.test(person) ? person : undefined,
      limit: 10000,
    }),
    getTeamMembers(session.organizationId),
    getTimeProjects(session.organizationId),
  ])
  const names = new Map(team.map((m) => [m.user_id, m.name]))
  const projectNames = new Map(projects.map((p) => [p.id, p.name]))
  // Archived projects aren't in the picker list but can still have time in range.
  const missing = [...new Set(entries.map((e) => e.project_id).filter((id) => !projectNames.has(id)))]
  if (missing.length) {
    const supabase = await createClient()
    const { data } = await supabase.from('projects').select('id, name').in('id', missing)
    for (const p of data ?? []) projectNames.set(p.id as string, p.name as string)
  }

  const csv = timeEntriesCsv(
    entries.map((e) => ({
      person: names.get(e.user_id) ?? 'Team member',
      project: projectNames.get(e.project_id) ?? 'Project',
      costCode: e.cost_category,
      entry: e,
    })),
    timeZone,
  )
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="trefort-time-${from}-to-${to}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
