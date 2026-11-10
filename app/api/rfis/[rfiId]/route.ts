import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { loadRfiDetail } from '@/lib/rfis-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** One question for the staff details panel. Row-level security decides what, if anything, is returned. */
export async function GET(_request: Request, { params }: { params: Promise<{ rfiId: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: NO_STORE })
  if (!session.organizationId || session.activationRequired || !session.role || session.role === 'client') {
    return NextResponse.json({ error: 'This question is not available.' }, { status: 404, headers: NO_STORE })
  }
  const { rfiId } = await params
  if (!z.uuid().safeParse(rfiId).success) {
    return NextResponse.json({ error: 'This question is not available.' }, { status: 404, headers: NO_STORE })
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.rfis) return NextResponse.json({ error: 'This question is not available.' }, { status: 404, headers: NO_STORE })

  const supabase = await createClient()
  const result = await loadRfiDetail(supabase, rfiId, session.userId)
  if (result.state === 'error') {
    return NextResponse.json({ error: 'The question could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
  if (result.state === 'not_found' || result.detail.rfi.organization_id !== session.organizationId) {
    return NextResponse.json({ error: 'This question is not available.' }, { status: 404, headers: NO_STORE })
  }
  return NextResponse.json(result.detail, { headers: NO_STORE })
}
