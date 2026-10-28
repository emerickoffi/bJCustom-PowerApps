import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EligibleSigner } from '@/lib/signatures'

export type ResolvedSigner = {
  kind: 'homeowner' | 'staff'
  contactId: string | null
  userId: string | null
  name: string
  email: string
}

type Project = { id: string; organization_id: string; primary_client_id: string | null; project_manager_id: string | null }

const ROLE_LABEL: Record<string, string> = { org_admin: 'Administrator', project_manager: 'Project manager', builder_staff: 'Staff' }

/**
 * Lists every possible signer for a project with an eligibility decision computed on the server.
 * Homeowners must be active contacts of the project's client with signing permission; embedded signing
 * additionally requires a portal account with access to this project. Staff must be able to view the project.
 */
export async function listSignerCandidates(admin: SupabaseClient, project: Project): Promise<(EligibleSigner & { resolved: ResolvedSigner | null; portalReady: boolean })[]> {
  const out: (EligibleSigner & { resolved: ResolvedSigner | null; portalReady: boolean })[] = []

  if (project.primary_client_id) {
    const { data: contacts } = await admin
      .from('client_contacts')
      .select('id, first_name, last_name, relationship, email, is_primary, portal_sign, archived_at')
      .eq('client_id', project.primary_client_id)
      .eq('organization_id', project.organization_id)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
    const ids = (contacts ?? []).map((c) => c.id)
    const { data: accounts } = ids.length
      ? await admin.from('portal_accounts').select('contact_id, user_id').in('contact_id', ids)
      : { data: [] as { contact_id: string; user_id: string }[] }
    const users = (accounts ?? []).map((a) => a.user_id)
    const { data: access } = users.length
      ? await admin.from('portal_project_access').select('user_id').eq('project_id', project.id).in('user_id', users)
      : { data: [] as { user_id: string }[] }
    const withAccess = new Set((access ?? []).map((a) => a.user_id))

    for (const c of contacts ?? []) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed contact'
      const email = c.email?.trim().toLowerCase() || null
      const userId = accounts?.find((a) => a.contact_id === c.id)?.user_id ?? null
      const portalReady = Boolean(userId && withAccess.has(userId))
      const reason = !email ? 'No email address on file' : !c.portal_sign ? 'Signing permission is off for this contact' : undefined
      out.push({
        key: `homeowner:${c.id}`,
        kind: 'homeowner',
        id: c.id,
        name,
        email,
        detail: [c.is_primary ? 'Primary contact' : null, c.relationship].filter(Boolean).join(' · ') || 'Homeowner contact',
        eligible: !reason,
        reason,
        portalReady,
        resolved: reason ? null : { kind: 'homeowner', contactId: c.id, userId: portalReady ? userId : null, name, email: email! },
      })
    }
  }

  const { data: members } = await admin
    .from('organization_memberships')
    .select('user_id, role')
    .eq('organization_id', project.organization_id)
    .eq('status', 'active')
    .neq('role', 'client')
  const { data: projectMembers } = await admin.from('project_members').select('user_id').eq('project_id', project.id)
  const assigned = new Set([project.project_manager_id, ...(projectMembers ?? []).map((m) => m.user_id)].filter(Boolean))
  const visible = (members ?? []).filter((m) => m.role !== 'builder_staff' || assigned.has(m.user_id))
  const { data: profiles } = visible.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', visible.map((m) => m.user_id))
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] }

  for (const m of visible) {
    const p = profiles?.find((x) => x.id === m.user_id)
    const email = p?.email?.trim().toLowerCase() || null
    const name = p?.full_name?.trim() || email || 'Team member'
    const reason = !email ? 'No email address on file' : undefined
    out.push({
      key: `staff:${m.user_id}`,
      kind: 'staff',
      id: m.user_id,
      name,
      email,
      detail: ROLE_LABEL[m.role] ?? 'Staff',
      eligible: !reason,
      reason,
      portalReady: true,
      resolved: reason ? null : { kind: 'staff', contactId: null, userId: m.user_id, name, email: email! },
    })
  }
  return out
}
