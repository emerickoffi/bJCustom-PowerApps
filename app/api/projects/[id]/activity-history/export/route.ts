import { NextResponse, type NextRequest } from 'next/server'
import {
  EMPTY_FILTERS,
  buildExportFilename,
  describeFilters,
  formatInZone,
  hasActiveFilters,
  parseHistoryFilters,
  presentEvent,
  resolveExportLimit,
  todayInZone,
} from '@/lib/activity-history'
import { countHistory, fetchAllHistory, getActorNames, resolveHistoryAccess } from '@/lib/activity-history-server'
import { buildHistoryWorkbook } from '@/lib/activity-history-workbook'

export const runtime = 'nodejs'
export const maxDuration = 60

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Best-effort per-instance throttle; serverless instances do not share this window.
const WINDOW_MS = 60_000
const MAX_EXPORTS_PER_WINDOW = 5
const recentExports = new Map<string, number[]>()

function throttled(userId: string) {
  const now = Date.now()
  const hits = (recentExports.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (hits.length >= MAX_EXPORTS_PER_WINDOW) {
    recentExports.set(userId, hits)
    return true
  }
  hits.push(now)
  recentExports.set(userId, hits)
  return false
}

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await resolveHistoryAccess(id)
  if (!access.ok) return fail(access.error, access.status)
  if (!access.canExport) return fail('Only organization admins and project managers can export activity history.', 403)

  const search = req.nextUrl.searchParams
  const scope = search.get('scope')
  if (scope !== 'all' && scope !== 'filtered') return fail('Choose an export scope.', 400)
  const parsed = parseHistoryFilters(search)
  if (!parsed.ok) return fail(parsed.error, 400)
  const filters = scope === 'all' ? EMPTY_FILTERS : parsed.filters

  if (throttled(access.session.userId)) return fail('Too many exports in a short time. Please wait a minute and try again.', 429)

  const limit = resolveExportLimit(process.env.ACTIVITY_HISTORY_EXPORT_LIMIT)
  const snapshotAt = new Date().toISOString()

  try {
    const total = await countHistory(access.supabase, access.project.id, filters, access.timeZone, snapshotAt)
    if (total === 0) return fail('There are no matching history events to export.', 404)
    if (total > limit) {
      return fail(
        `This export would include ${total.toLocaleString('en-US')} events, above the ${limit.toLocaleString('en-US')}-event limit. Narrow the date range or filters and export again.`,
        413,
      )
    }

    const [rows, actors] = await Promise.all([
      fetchAllHistory(access.supabase, access.project.id, filters, access.timeZone, snapshotAt, limit),
      getActorNames(access.session.organizationId),
    ])
    const events = rows.map((r) => presentEvent(r, actors.nameFor, access.timeZone))
    const generated = formatInZone(snapshotAt, access.timeZone)

    const buffer = await buildHistoryWorkbook(events, {
      organizationName: access.organizationName,
      projectName: access.project.name,
      projectNumber: access.project.project_number,
      timeZone: access.timeZone,
      zoneName: generated.zoneName,
      generatedAtLabel: `${generated.date} ${generated.time} (${snapshotAt} UTC)`,
      exportedBy: access.session.fullName || access.session.email || 'Team member',
      scope: scope === 'all' || !hasActiveFilters(filters) ? 'All history' : 'Filtered history',
      appliedFilters: describeFilters(filters, (uid) => actors.nameFor(uid) ?? 'Former team member'),
    })

    const filename = buildExportFilename(access.project, todayInZone(access.timeZone))
    return new NextResponse(buffer, {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Export-Count': String(events.length),
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return fail('The export could not be generated. Please try again.', 500)
  }
}
