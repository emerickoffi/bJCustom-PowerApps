import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { COMPANY_LOGOS_BUCKET, detectLogoMime, logoResponseHeaders, logoStoragePath } from '@/lib/company-logo'

export const dynamic = 'force-dynamic'

/**
 * Serves the signed-in user's own company logo from the private company-logos bucket. The read uses
 * the user's session, so the storage select policy (company members only) is enforced by the
 * database as well as by deriving the path from the session here.
 */
export async function GET() {
  const session = await getSession()
  if (!session?.organizationId) return new NextResponse(null, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .download(logoStoragePath(session.organizationId))
  if (error || !data) return new NextResponse(null, { status: 404 })

  const bytes = new Uint8Array(await data.arrayBuffer())
  const mime = detectLogoMime(bytes)
  if (!mime) return new NextResponse(null, { status: 404 })

  return new NextResponse(bytes, { status: 200, headers: logoResponseHeaders(mime) })
}
