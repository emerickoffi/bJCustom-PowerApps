import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSubcontractorSession } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { loadRfiDetail } from '@/lib/rfis-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const UNAVAILABLE = { error: 'This question is not available.' }

/**
 * One question for a subcontractor responder. Row-level security decides what is returned; this route only adds
 * that the question must belong to a builder the subcontractor works with.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ rfiId: string }> }) {
  const session = await getSubcontractorSession()
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: NO_STORE })
  if (session.activationRequired) return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE })
  const { rfiId } = await params
  if (!z.uuid().safeParse(rfiId).success) return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE })

  const supabase = await createClient()
  const result = await loadRfiDetail(supabase, rfiId, session.userId)
  if (result.state === 'error') {
    return NextResponse.json({ error: 'The question could not be loaded.' }, { status: 500, headers: NO_STORE })
  }
  const orgs = new Set(session.accounts.map((a) => a.organizationId))
  if (result.state === 'not_found' || !orgs.has(result.detail.rfi.organization_id)) {
    return NextResponse.json(UNAVAILABLE, { status: 404, headers: NO_STORE })
  }
  return NextResponse.json(result.detail, { headers: NO_STORE })
}
