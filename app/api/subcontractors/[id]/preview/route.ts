import { NextResponse } from 'next/server'
import { loadSubcontractorPreview } from '@/lib/subcontractor-preview-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await loadSubcontractorPreview(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
    return NextResponse.json(result.preview, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Subcontractor details could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
}
