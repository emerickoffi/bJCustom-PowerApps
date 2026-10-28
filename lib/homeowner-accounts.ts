import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { CONTACT_RELATIONSHIP_LABELS } from '@/lib/domain'

export type HomeownerAccountStatus =
  | 'active'
  | 'pending_activation'
  | 'suspended'
  | 'contact_disabled'
  | 'unknown'
  | 'not_provisioned'

export const HOMEOWNER_STATUS_LABELS: Record<HomeownerAccountStatus, string> = {
  active: 'Active',
  pending_activation: 'Pending activation',
  suspended: 'Suspended',
  contact_disabled: 'Portal disabled for contact',
  unknown: 'Status unavailable',
  not_provisioned: 'Not provisioned',
}

export type HomeownerAccountRow = {
  key: string
  name: string
  email: string | null
  clientId: string
  clientName: string
  clientNumber: number | null
  relationship: string
  status: HomeownerAccountStatus
  hasAccount: boolean
  isLegacyInvite: boolean
  projectCount: number
  permissions: string[]
}

const ROW_LIMIT = 200

type ContactRecord = {
  id: string
  client_id: string
  first_name: string
  last_name: string
  email: string | null
  relationship: string
  is_primary: boolean
  portal_enabled: boolean
  portal_view_reports: boolean
  portal_validate_issues: boolean
  portal_acknowledge: boolean
  portal_sign: boolean
}

type ClientRecord = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  client_number: number | null
  portal_user_id: string | null
}

function contactPermissions(c: ContactRecord): string[] {
  if (!c.portal_enabled) return []
  return [
    c.portal_view_reports && 'View reports',
    c.portal_validate_issues && 'Validate issues',
    c.portal_acknowledge && 'Acknowledge',
    c.portal_sign && 'Sign',
  ].filter(Boolean) as string[]
}

/**
 * Lists client contacts (and client records acting as the primary person) with their verified
 * portal-account state. A contact only counts as a user when a portal_accounts row links it to
 * an auth user; status comes from that user's organization membership, never from contact flags.
 */
export async function loadHomeownerAccounts(
  organizationId: string,
  q: string,
): Promise<{ rows: HomeownerAccountRow[]; truncated: boolean }> {
  const supabase = await createClient()

  let matchingClientIds: string[] | null = null
  if (q) {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('organization_id', organizationId)
      .neq('status', 'archived')
      .or(`first_name.ilike.*${q}*,last_name.ilike.*${q}*,email.ilike.*${q}*,company_name.ilike.*${q}*`)
      .limit(ROW_LIMIT)
    matchingClientIds = (data ?? []).map((c) => c.id as string)
  }

  let contactQuery = supabase
    .from('client_contacts')
    .select(
      'id, client_id, first_name, last_name, email, relationship, is_primary, portal_enabled, portal_view_reports, portal_validate_issues, portal_acknowledge, portal_sign',
    )
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('last_name')
    .limit(ROW_LIMIT + 1)
  if (q) {
    contactQuery = contactQuery.or(
      [
        `first_name.ilike.*${q}*`,
        `last_name.ilike.*${q}*`,
        `email.ilike.*${q}*`,
        ...(matchingClientIds?.length ? [`client_id.in.(${matchingClientIds.join(',')})`] : []),
      ].join(','),
    )
  }

  const [contactsRes, accountsRes, primaryContactsRes] = await Promise.all([
    contactQuery,
    supabase
      .from('portal_accounts')
      .select('id, client_id, contact_id, user_id, portal_project_access(project_id)')
      .eq('organization_id', organizationId),
    supabase
      .from('client_contacts')
      .select('client_id')
      .eq('organization_id', organizationId)
      .eq('is_primary', true)
      .is('archived_at', null),
  ])

  const contactsRaw = (contactsRes.data ?? []) as ContactRecord[]
  const truncated = contactsRaw.length > ROW_LIMIT
  const contacts = contactsRaw.slice(0, ROW_LIMIT)
  const accounts = (accountsRes.data ?? []) as {
    id: string
    client_id: string
    contact_id: string | null
    user_id: string
    portal_project_access: { project_id: string }[] | null
  }[]
  const clientsWithPrimaryContact = new Set((primaryContactsRes.data ?? []).map((c) => c.client_id as string))

  const accountByContact = new Map(accounts.filter((a) => a.contact_id).map((a) => [a.contact_id as string, a]))
  const clientRecordAccounts = new Map(accounts.filter((a) => !a.contact_id).map((a) => [a.client_id, a]))

  const clientIds = new Set<string>(contacts.map((c) => c.client_id))
  for (const a of clientRecordAccounts.values()) clientIds.add(a.client_id)
  if (matchingClientIds) for (const id of matchingClientIds) clientIds.add(id)

  let clientQuery = supabase
    .from('clients')
    .select('id, first_name, last_name, email, client_number, portal_user_id')
    .eq('organization_id', organizationId)
    .neq('status', 'archived')
  if (q) clientQuery = clientQuery.in('id', [...clientIds].length ? [...clientIds] : ['00000000-0000-0000-0000-000000000000'])
  const { data: clientData } = await clientQuery.limit(ROW_LIMIT * 2)
  const clients = (clientData ?? []) as ClientRecord[]
  const clientById = new Map(clients.map((c) => [c.id, c]))

  const legacyUserIds = clients
    .filter((c) => c.portal_user_id && !clientRecordAccounts.has(c.id))
    .map((c) => c.portal_user_id as string)
  const userIds = [...new Set([...accounts.map((a) => a.user_id), ...legacyUserIds])]

  const [membershipsRes, legacyAccessRes] = await Promise.all([
    userIds.length
      ? supabase
          .from('organization_memberships')
          .select('user_id, role, status, activation_required')
          .eq('organization_id', organizationId)
          .in('user_id', userIds)
      : Promise.resolve({ data: [] }),
    legacyUserIds.length
      ? supabase
          .from('portal_project_access')
          .select('user_id, project_id')
          .eq('organization_id', organizationId)
          .in('user_id', legacyUserIds)
      : Promise.resolve({ data: [] }),
  ])
  const membershipByUser = new Map(
    ((membershipsRes.data ?? []) as { user_id: string; role: string; status: string; activation_required: boolean }[])
      .filter((m) => m.role === 'client')
      .map((m) => [m.user_id, m]),
  )
  const legacyProjects = new Map<string, Set<string>>()
  for (const a of (legacyAccessRes.data ?? []) as { user_id: string; project_id: string }[]) {
    const set = legacyProjects.get(a.user_id) ?? new Set<string>()
    set.add(a.project_id)
    legacyProjects.set(a.user_id, set)
  }

  const membershipStatus = (userId: string): HomeownerAccountStatus => {
    const m = membershipByUser.get(userId)
    if (!m) return 'unknown'
    if (m.status === 'suspended') return 'suspended'
    if (m.activation_required) return 'pending_activation'
    return m.status === 'active' ? 'active' : 'unknown'
  }
  const clientLabel = (c: ClientRecord | undefined) => (c ? `${c.first_name} ${c.last_name}` : 'Unknown client')

  const rows: HomeownerAccountRow[] = []

  for (const contact of contacts) {
    const client = clientById.get(contact.client_id)
    if (!client) continue
    const account = accountByContact.get(contact.id)
    let status: HomeownerAccountStatus = 'not_provisioned'
    if (account) {
      status = membershipStatus(account.user_id)
      if (status === 'active' && !contact.portal_enabled) status = 'contact_disabled'
    }
    rows.push({
      key: `contact:${contact.id}`,
      name: `${contact.first_name} ${contact.last_name}`,
      email: contact.email,
      clientId: client.id,
      clientName: clientLabel(client),
      clientNumber: client.client_number,
      relationship: contact.is_primary
        ? 'Primary'
        : (CONTACT_RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship),
      status,
      hasAccount: Boolean(account),
      isLegacyInvite: false,
      projectCount: new Set((account?.portal_project_access ?? []).map((p) => p.project_id)).size,
      permissions: account ? contactPermissions(contact) : [],
    })
  }

  for (const client of clients) {
    const account = clientRecordAccounts.get(client.id)
    const legacyUser = !account && client.portal_user_id ? client.portal_user_id : null
    if (!account && !legacyUser && clientsWithPrimaryContact.has(client.id)) continue
    if (!q && !account && !legacyUser && rows.length >= ROW_LIMIT) continue
    const userId = account?.user_id ?? legacyUser
    rows.push({
      key: `client:${client.id}`,
      name: clientLabel(client),
      email: client.email,
      clientId: client.id,
      clientName: clientLabel(client),
      clientNumber: client.client_number,
      relationship: 'Client record',
      status: userId ? membershipStatus(userId) : 'not_provisioned',
      hasAccount: Boolean(userId),
      isLegacyInvite: Boolean(legacyUser),
      projectCount: account
        ? new Set((account.portal_project_access ?? []).map((p) => p.project_id)).size
        : legacyUser
          ? (legacyProjects.get(legacyUser)?.size ?? 0)
          : 0,
      permissions: userId ? ['Full homeowner access'] : [],
    })
  }

  rows.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.name.localeCompare(b.name))
  return { rows, truncated }
}
