import { NextResponse } from 'next/server'
import { loadCompanyPreview } from '@/lib/record-preview-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const result = await loadCompanyPreview(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
    return NextResponse.json(result.preview, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'Company details could not be loaded. Please try again.' }, { status: 500, headers: NO_STORE })
  }
}
