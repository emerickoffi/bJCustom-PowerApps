import { NextResponse, type NextRequest } from 'next/server'
import { HISTORY_PAGE_SIZE, parseHistoryFilters, parsePage, presentEvent } from '@/lib/activity-history'
import { fetchHistoryPage, getActorNames, resolveHistoryAccess } from '@/lib/activity-history-server'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await resolveHistoryAccess(id)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status, headers: NO_STORE })

  const search = req.nextUrl.searchParams
  const parsed = parseHistoryFilters(search)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: NO_STORE })
  const page = parsePage(search.get('page'))
  if (!page) return NextResponse.json({ error: 'Page number is invalid.' }, { status: 400, headers: NO_STORE })

  try {
    const [{ events, total }, actors] = await Promise.all([
      fetchHistoryPage(access.supabase, access.project.id, parsed.filters, access.timeZone, page, HISTORY_PAGE_SIZE),
      getActorNames(access.session.organizationId),
    ])
    return NextResponse.json(
      {
        events: events.map((e) => presentEvent(e, actors.nameFor, access.timeZone)),
        total,
        page,
        pageSize: HISTORY_PAGE_SIZE,
        pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
      },
      { headers: NO_STORE },
    )
  } catch {
    return NextResponse.json({ error: 'Activity history could not be loaded. Please try again.' }, { status: 500, headers: NO_STORE })
  }
}
