import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { buildAuthorizeUrl, getQuickBooksStatus } from '@/lib/quickbooks'

export const dynamic = 'force-dynamic'

const back = (req: NextRequest, result: string) => NextResponse.redirect(new URL(`/settings/integrations?qbo=${result}`, req.url))

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!getQuickBooksStatus().credentialsConfigured) return back(req, 'not_configured')

  // Turning the module on runs the plan check (Business) in the database.
  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_features')
    .upsert({ organization_id: session.organizationId, feature_key: 'quickbooks', enabled: true }, { onConflict: 'organization_id,feature_key' })
  if (error) return back(req, 'plan')

  const state = crypto.randomUUID()
  const res = NextResponse.redirect(buildAuthorizeUrl(state))
  res.cookies.set('qbo_oauth', `${state}.${session.organizationId}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/integrations/quickbooks',
    maxAge: 600,
  })
  return res
}
