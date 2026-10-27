import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ClientStatus, OrgRole, ProjectStatus } from '@/lib/domain'

export type ClientSummary = {
  id: string
  client_number: number
  first_name: string
  last_name: string
  company_name: string | null
  email: string | null
  phone: string | null
  city: string | null
  state: string | null
  status: ClientStatus
  portal_user_id: string | null
  created_at: string
}

export type ProjectSummary = {
  id: string
  project_number: string
  name: string
  status: ProjectStatus
  address_line1: string
  city: string
  state: string
  postal_code: string
  progress_percent: number | null
  target_completion_date: string | null
  estimated_budget_cents: number | null
  project_manager_id: string | null
  updated_at: string
  primary_client: { id: string; first_name: string; last_name: string } | null
}

export type StaffMember = {
  user_id: string
  role: OrgRole
  full_name: string | null
  email: string | null
}

export const PROJECT_SUMMARY_COLUMNS =
  'id, project_number, name, status, address_line1, city, state, postal_code, progress_percent, target_completion_date, estimated_budget_cents, project_manager_id, updated_at, primary_client:clients!projects_primary_client_id_fkey(id, first_name, last_name)'

/** Active staff members of an organization, with profile names, for assignment pickers. */
export async function getStaffMembers(organizationId: string, roles?: OrgRole[]): Promise<StaffMember[]> {
  const supabase = await createClient()
  let query = supabase
    .from('organization_memberships')
    .select('user_id, role')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .neq('role', 'client')
  if (roles) query = query.in('role', roles)
  const { data: memberships } = await query
  if (!memberships?.length) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in(
      'id',
      memberships.map((m) => m.user_id),
    )
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))
  return memberships
    .map((m) => ({
      user_id: m.user_id,
      role: m.role as OrgRole,
      full_name: byId.get(m.user_id)?.full_name ?? null,
      email: byId.get(m.user_id)?.email ?? null,
    }))
    .sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? ''))
}

export async function getProfileNames(userIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (!ids.length) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
  return new Map((data ?? []).map((p) => [p.id, p.full_name || p.email || 'Team member']))
}

export async function getClientOptions(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('clients')
    .select('id, first_name, last_name, company_name, client_number')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
    .order('last_name')
    .limit(500)
  return (data ?? []).map((c) => ({
    value: c.id,
    label: `${c.last_name}, ${c.first_name}${c.company_name ? ` (${c.company_name})` : ''} — #${c.client_number}`,
  }))
}
