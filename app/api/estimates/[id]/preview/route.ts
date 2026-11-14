import { NextResponse } from 'next/server'
import { loadEstimatePreview } from '@/lib/estimate-preview-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await loadEstimatePreview(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
    return NextResponse.json(result.preview, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Estimate details could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
