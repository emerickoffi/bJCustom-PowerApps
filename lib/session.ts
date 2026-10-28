import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { brandFromOrganization, type OrganizationBrand, type OrganizationRow } from '@/lib/branding'
import type { OrgRole } from '@/lib/domain'

/** Remembers which of the user's own active memberships is the current workspace. It never grants access. */
export const WORKSPACE_COOKIE = 'bj_workspace'

export type Workspace = {
  organizationId: string
  organizationName: string
  role: OrgRole
  kind: 'staff' | 'homeowner'
}

export type SessionContext = {
  userId: string
  email: string
  fullName: string | null
  role: OrgRole | null
  organizationId: string | null
  clientId: string | null
  brand: OrganizationBrand
  activationRequired: boolean
  activationExpired: boolean
  workspaces: Workspace[]
}

type MembershipRow = {
  role: OrgRole
  organization_id: string
  client_id: string | null
  activation_required: boolean
  organizations: OrganizationRow | null
}

async function loadMemberships(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('organization_memberships')
    .select(
      'role, organization_id, client_id, activation_required, organizations(id, display_name, legal_name, logo_url, primary_color, secondary_color, address_line1, city, state, postal_code, phone, email, website)',
    )
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as MembershipRow[]
}

export const getSession = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  let memberships = await loadMemberships(supabase, user.id)
  if (!memberships.length) {
    const { data: accepted } = await supabase.rpc('accept_pending_invitations')
    if (accepted) memberships = await loadMemberships(supabase, user.id)
  }

  const selectedOrg = (await cookies()).get(WORKSPACE_COOKIE)?.value
  const membership = memberships.find((m) => m.organization_id === selectedOrg) ?? memberships[0] ?? null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle()

  const activationRequired = Boolean(membership?.activation_required)
  const expiresAt = user.app_metadata?.temp_credential_expires_at as string | null | undefined

  return {
    userId: user.id,
    email: user.email ?? '',
    fullName: profile?.full_name ?? null,
    role: membership?.role ?? null,
    organizationId: membership?.organization_id ?? null,
    clientId: membership?.client_id ?? null,
    brand: brandFromOrganization(membership?.organizations),
    activationRequired,
    activationExpired: activationRequired && Boolean(expiresAt) && new Date(expiresAt as string).getTime() < Date.now(),
    workspaces: memberships.map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organizations?.display_name || m.organizations?.legal_name || 'Organization',
      role: m.role,
      kind: m.role === 'client' ? 'homeowner' : 'staff',
    })),
  }
})

export type StaffSession = SessionContext & { role: Exclude<OrgRole, 'client'>; organizationId: string }

export async function requireStaff(): Promise<StaffSession> {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.organizationId || !session.role) redirect('/onboarding')
  if (session.activationRequired) redirect('/account/activate')
  if (session.role === 'client') redirect('/portal')
  return session as StaffSession
}

export async function requireManager(): Promise<StaffSession> {
  const session = await requireStaff()
  if (!canManage(session.role)) redirect('/dashboard')
  return session
}

export async function requireAdmin(): Promise<StaffSession> {
  const session = await requireStaff()
  if (session.role !== 'org_admin') redirect('/dashboard')
  return session
}

export function canManage(role: OrgRole | null): boolean {
  return role === 'org_admin' || role === 'project_manager'
}
