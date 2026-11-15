import { NextResponse } from 'next/server'
import { loadDailyLogPreview } from '@/lib/daily-log-preview-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await loadDailyLogPreview(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
    return NextResponse.json(result.preview, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Daily log details could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
