import { NextResponse } from 'next/server'
import { canManage, getSession } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadAssignableProjectOptions, loadCompanyOptions } from '@/lib/contacts-data'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/** Company and project choices for the Quick Create contact drawer. Same access rule as /contacts/people/new. */
export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers: NO_STORE })
  if (!session.organizationId || session.activationRequired || !canManage(session.role)) {
    return NextResponse.json({ error: 'You do not have permission to add contacts.' }, { status: 403, headers: NO_STORE })
  }

  const supabase = await createClient()
  const [companies, projects] = await Promise.all([
    loadCompanyOptions(supabase, session.organizationId),
    loadAssignableProjectOptions(supabase, session.organizationId),
  ])
  return NextResponse.json({ companies, projects }, { headers: NO_STORE })
}
