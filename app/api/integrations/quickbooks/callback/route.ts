import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { completeQuickBooksConnection } from '@/lib/quickbooks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  const params = req.nextUrl.searchParams
  const cookie = req.cookies.get('qbo_oauth')?.value ?? ''
  const [state, orgId] = cookie.split('.')

  const done = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?qbo=${result}`, req.url))
    res.cookies.set('qbo_oauth', '', { path: '/api/integrations/quickbooks', maxAge: 0 })
    return res
  }

  if (params.get('error')) return done('cancelled')
  const code = params.get('code')
  const realmId = params.get('realmId')
  if (!state || state !== params.get('state') || orgId !== session.organizationId) return done('expired')
  if (!code || !realmId || !/^\d{1,32}$/.test(realmId)) return done('failed')

  try {
    await completeQuickBooksConnection(session.organizationId, session.userId, code, realmId)
    return done('connected')
  } catch (err) {
    console.error('[quickbooks] connect failed', { message: err instanceof Error ? err.message : String(err) })
    return done('failed')
  }
}
