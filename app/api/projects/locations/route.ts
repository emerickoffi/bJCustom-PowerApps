import { NextResponse } from 'next/server'
import { loadProjectLocations } from '@/lib/project-locations-data'
import { parseLocationIds } from '@/lib/project-locations'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null
  const ids = parseLocationIds(body?.ids)
  if (!ids) return NextResponse.json({ error: 'Invalid project list.' }, { status: 400, headers: NO_STORE })
  try {
    const result = await loadProjectLocations(ids)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
    return NextResponse.json({ locations: result.locations }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Project locations could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
