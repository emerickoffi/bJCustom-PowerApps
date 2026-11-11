import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/invitations'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const form = await request.formData().catch(() => null)
  const next = safeNextPath(form?.get('next')?.toString())
  const target = new URL('/auth/login', request.nextUrl.origin)
  if (next !== '/') target.searchParams.set('next', next)
  return NextResponse.redirect(target, { status: 303 })
}
