import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type SubcontractorAccount = {
  id: string
  organizationId: string
  companyId: string
  companyName: string
}

export type SubcontractorSession = {
  userId: string
  email: string
  fullName: string
  accounts: SubcontractorAccount[]
  activationRequired: boolean
  activationExpired: boolean
}

type AccountRow = {
  id: string
  organization_id: string
  subcontractor_company_id: string
  full_name: string
  subcontractor_companies: { company_name: string; status: string } | null
}

/** Active portal grants for the signed-in user. Inactive companies are excluded; the database enforces the same rule. */
export const getSubcontractorSession = cache(async (): Promise<SubcontractorSession | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('subcontractor_portal_accounts')
    .select('id, organization_id, subcontractor_company_id, full_name, subcontractor_companies(company_name, status)')
    .eq('user_id', user.id)
    .eq('status', 'active')
  if (error) return null
  const rows = (data ?? []) as unknown as AccountRow[]
  const accounts = rows
    .filter((r) => r.subcontractor_companies?.status === 'active')
    .map((r) => ({
      id: r.id,
      organizationId: r.organization_id,
      companyId: r.subcontractor_company_id,
      companyName: r.subcontractor_companies?.company_name ?? 'Subcontractor',
    }))
  if (!accounts.length) return null
  const expiresAt = user.app_metadata?.temp_credential_expires_at as string | null | undefined
  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: rows[0]?.full_name ?? user.email ?? 'Subcontractor',
    accounts,
    activationRequired: Boolean(expiresAt),
    activationExpired: Boolean(expiresAt) && new Date(expiresAt as string).getTime() < Date.now(),
  }
})

export async function requireSubcontractor(): Promise<SubcontractorSession> {
  const session = await getSubcontractorSession()
  if (!session) redirect('/')
  if (session.activationRequired) redirect('/sub/activate')
  return session
}
