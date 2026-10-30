import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import {
  derivePortalStatus,
  isContactVisibleOnProject,
  type DuplicateCandidate,
  type HomeownerPortalStatus,
} from '@/lib/project-homeowners'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type HomeownerContact = {
  id: string
  name: string
  relationship: string
  email: string | null
  phone: string | null
  alternate_phone: string | null
  isPrimary: boolean
  projectOnly: boolean
  portalStatus: HomeownerPortalStatus | null
}

export type HomeownerGroup = {
  linkId: string
  linkRelationship: string
  client: { id: string; name: string; email: string | null; phone: string | null } | null
  contacts: HomeownerContact[]
}

export type ExistingClientContact = DuplicateCandidate & { relationship: string; visibleHere: boolean; archived: boolean }

export type ProjectHomeowners = {
  groups: HomeownerGroup[]
  primaryClientId: string | null
  /** Contacts on the primary homeowner that could be reused instead of duplicated. */
  primaryContacts: ExistingClientContact[]
  scopingAvailable: boolean
}

const MISSING_TABLE = new Set(['42P01', 'PGRST205'])

export async function loadProjectHomeowners(
  supabase: Supabase,
  organizationId: string,
  projectId: string,
): Promise<ProjectHomeowners> {
  const { data: linkRows } = await supabase
    .from('project_clients')
    .select('id, relationship, client:clients(id, first_name, last_name, email, phone)')
    .eq('project_id', projectId)
    .eq('organization_id', organizationId)
    .order('created_at')
  const links = (linkRows ?? []) as unknown as {
    id: string
    relationship: string
    client: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null
  }[]
  const clientIds = links.map((l) => l.client?.id).filter((id): id is string => Boolean(id))
  const primaryLink = links.find((l) => l.relationship === 'primary_owner') ?? links[0]
  const primaryClientId = primaryLink?.client?.id ?? null

  if (clientIds.length === 0) return { groups: [], primaryClientId, primaryContacts: [], scopingAvailable: true }

  const [contactsRes, accountsRes] = await Promise.all([
    supabase
      .from('client_contacts')
      .select('id, client_id, first_name, last_name, relationship, email, phone, alternate_phone, is_primary, archived_at')
      .in('client_id', clientIds)
      .eq('organization_id', organizationId)
      .order('is_primary', { ascending: false })
      .order('created_at'),
    supabase
      .from('portal_accounts')
      .select('id, client_id, contact_id, user_id, portal_project_access(project_id)')
      .in('client_id', clientIds)
      .eq('organization_id', organizationId),
  ])
  const contacts = (contactsRes.data ?? []) as {
    id: string
    client_id: string
    first_name: string
    last_name: string
    relationship: string
    email: string | null
    phone: string | null
    alternate_phone: string | null
    is_primary: boolean
    archived_at: string | null
  }[]
  const contactIds = contacts.map((c) => c.id)

  let scopingAvailable = true
  const scopes = new Map<string, string[]>()
  if (contactIds.length) {
    const { data, error } = await supabase
      .from('client_contact_projects')
      .select('contact_id, project_id')
      .in('contact_id', contactIds)
    if (error && MISSING_TABLE.has(error.code)) scopingAvailable = false
    for (const row of (data ?? []) as { contact_id: string; project_id: string }[]) {
      scopes.set(row.contact_id, [...(scopes.get(row.contact_id) ?? []), row.project_id])
    }
  }

  const accounts = (accountsRes.data ?? []) as unknown as {
    client_id: string
    contact_id: string | null
    user_id: string
    portal_project_access: { project_id: string }[] | null
  }[]
  const userIds = accounts.map((a) => a.user_id)
  const { data: memberRows } = userIds.length
    ? await supabase
        .from('organization_memberships')
        .select('user_id, status, activation_required')
        .eq('organization_id', organizationId)
        .in('user_id', userIds)
    : { data: [] }
  const members = new Map(
    ((memberRows ?? []) as { user_id: string; status: string; activation_required: boolean }[]).map((m) => [m.user_id, m]),
  )
  const portalFor = (contact: { id: string; client_id: string; is_primary: boolean }): HomeownerPortalStatus => {
    const account =
      accounts.find((a) => a.contact_id === contact.id) ??
      (contact.is_primary ? accounts.find((a) => a.client_id === contact.client_id && !a.contact_id) : undefined)
    if (!account) return 'not_provisioned'
    return derivePortalStatus(
      { projectIds: (account.portal_project_access ?? []).map((p) => p.project_id) },
      members.get(account.user_id),
      projectId,
    )
  }

  const groups: HomeownerGroup[] = links.map((link) => ({
    linkId: link.id,
    linkRelationship: link.relationship,
    client: link.client
      ? {
          id: link.client.id,
          name: `${link.client.first_name} ${link.client.last_name}`.trim(),
          email: link.client.email,
          phone: link.client.phone,
        }
      : null,
    contacts: contacts
      .filter((c) => c.client_id === link.client?.id && !c.archived_at)
      .filter((c) => c.is_primary || isContactVisibleOnProject(scopes.get(c.id) ?? [], projectId))
      .map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        relationship: c.relationship,
        email: c.email,
        phone: c.phone,
        alternate_phone: c.alternate_phone,
        isPrimary: c.is_primary,
        projectOnly: (scopes.get(c.id) ?? []).length > 0,
        portalStatus: portalFor(c),
      })),
  }))

  const primaryContacts: ExistingClientContact[] = contacts
    .filter((c) => c.client_id === primaryClientId && !c.is_primary)
    .map((c) => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      alternate_phone: c.alternate_phone,
      relationship: c.relationship,
      archived: Boolean(c.archived_at),
      visibleHere: !c.archived_at && isContactVisibleOnProject(scopes.get(c.id) ?? [], projectId),
    }))

  return { groups, primaryClientId, primaryContacts, scopingAvailable }
}
