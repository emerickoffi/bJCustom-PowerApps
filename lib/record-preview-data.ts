import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { CATEGORY_LABELS, categoryKeyFromName, personName } from '@/lib/contacts'
import { formatAddress } from '@/lib/format'
import type { ProjectStatus } from '@/lib/domain'
import {
  mergeCompanyProjects,
  pickClientContacts,
  pickPersonAccess,
  summarizePortalAccounts,
  type ClientContactRow,
  type ClientPortal,
  type ClientPreview,
  type ClientPreviewProject,
  type CompanyPreview,
  type LinkedSubcontractor,
  type PersonAccess,
  type PersonPreview,
  type SubcontractorAccountRow,
} from '@/lib/record-preview'

type Supabase = Awaited<ReturnType<typeof createClient>>

type Denied = { ok: false; status: 401 | 403 | 404; error: string }
export type PreviewResult<T> = { ok: true; preview: T } | Denied

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const notFound = (noun: string): Denied => ({ ok: false, status: 404, error: `${noun} not found.` })

/**
 * The signed-in staff member inside their current organization. Every read that follows runs as that user and is
 * filtered to that organization, so row-level security applies exactly as on the record's own page.
 */
async function resolveViewer(access: 'staff' | 'manager') {
  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Please sign in again.' } satisfies Denied
  const denied = { ok: false, status: 403, error: 'You do not have access to this record.' } satisfies Denied
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) return denied
  const manager = canManage(session.role)
  if (access === 'manager' && !manager) return denied
  return {
    ok: true as const,
    supabase: await createClient(),
    organizationId: session.organizationId,
    manager,
    admin: session.role === 'org_admin',
  }
}

// ============ People ============

type PersonCompanyRow = {
  company_id: string
  position_or_role: string | null
  is_primary_contact: boolean
  company: { company_name: string; subcontractor_company_id: string | null } | null
}

type PersonProjectRow = {
  project_id: string
  project_role: string | null
  project: { name: string; project_number: string | null } | null
}

/** The business directory is open to administrators and project managers only, the same rule as the Contacts page. */
export async function loadPersonPreview(personId: string): Promise<PreviewResult<PersonPreview>> {
  if (!UUID.test(personId)) return notFound('Contact')
  const viewer = await resolveViewer('manager')
  if (!viewer.ok) return viewer
  const { supabase, organizationId } = viewer

  const [personRes, companiesRes, projectsRes, features] = await Promise.all([
    supabase
      .from('business_people')
      .select('id, first_name, last_name, email, primary_phone, secondary_phone, specialty, status, notes')
      .eq('organization_id', organizationId)
      .eq('id', personId)
      .maybeSingle(),
    supabase
      .from('business_person_companies')
      .select('company_id, position_or_role, is_primary_contact, company:business_companies(company_name, subcontractor_company_id)')
      .eq('organization_id', organizationId)
      .eq('person_id', personId)
      .eq('status', 'active'),
    supabase
      .from('business_person_projects')
      .select('project_id, project_role, project:projects(name, project_number)')
      .eq('organization_id', organizationId)
      .eq('person_id', personId)
      .eq('status', 'active'),
    getOrgFeatures(organizationId),
  ])
  if (personRes.error) throw new Error('person_preview_failed')
  const person = personRes.data
  if (!person) return notFound('Contact')

  const companyRows = (companiesRes.data ?? []) as unknown as PersonCompanyRow[]
  const projectRows = (projectsRes.data ?? []) as unknown as PersonProjectRow[]

  return {
    ok: true,
    preview: {
      kind: 'person',
      id: person.id,
      status: person.status,
      specialty: person.specialty,
      email: person.email,
      primaryPhone: person.primary_phone,
      secondaryPhone: person.secondary_phone,
      companies: companiesRes.error
        ? null
        : companyRows
            .map((row) => ({
              id: row.company_id,
              name: row.company?.company_name ?? 'Unknown company',
              role: row.position_or_role,
              primary: row.is_primary_contact,
              href: `/contacts/companies/${row.company_id}`,
            }))
            .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name)),
      projects: projectsRes.error
        ? null
        : projectRows
            .map((row) => ({
              id: row.project_id,
              name: row.project?.name ?? 'Unknown project',
              number: row.project?.project_number ?? null,
              role: row.project_role,
              href: `/projects/${row.project_id}`,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
      access: companiesRes.error
        ? { state: 'error' }
        : await loadPersonAccess(supabase, organizationId, person.email, Boolean(features.subcontractors), companyRows),
      notes: person.notes?.trim() || null,
    },
  }
}

async function loadPersonAccess(
  supabase: Supabase,
  organizationId: string,
  email: string | null,
  subcontractorsEnabled: boolean,
  companies: PersonCompanyRow[],
): Promise<PersonAccess> {
  const linked: LinkedSubcontractor[] = subcontractorsEnabled
    ? companies.flatMap((row) =>
        row.company?.subcontractor_company_id
          ? [{ subcontractorId: row.company.subcontractor_company_id, companyName: row.company.company_name }]
          : [],
      )
    : []
  if (!linked.length || !email) return pickPersonAccess(email, linked, [])
  const { data, error } = await supabase
    .from('subcontractor_portal_accounts')
    .select('subcontractor_company_id, email, status')
    .eq('organization_id', organizationId)
    .in('subcontractor_company_id', [...new Set(linked.map((l) => l.subcontractorId))])
  if (error) return { state: 'error' }
  return pickPersonAccess(email, linked, (data ?? []) as SubcontractorAccountRow[])
}

// ============ Companies ============

type CompanyContactRow = {
  id: string
  person_id: string
  position_or_role: string | null
  is_primary_contact: boolean
  person: { first_name: string; last_name: string; email: string | null; primary_phone: string | null } | null
}

type ProjectJoin = { id: string; name: string; project_number: string | null } | null

export async function loadCompanyPreview(companyId: string): Promise<PreviewResult<CompanyPreview>> {
  if (!UUID.test(companyId)) return notFound('Company')
  const viewer = await resolveViewer('manager')
  if (!viewer.ok) return viewer
  const { supabase, organizationId } = viewer

  const [companyRes, categoriesRes, contactsRes, features] = await Promise.all([
    supabase
      .from('business_companies')
      .select(
        'id, company_email, company_phone, secondary_company_phone, website, address_line1, city, state, postal_code, status, subcontractor_company_id, notes',
      )
      .eq('organization_id', organizationId)
      .eq('id', companyId)
      .maybeSingle(),
    supabase
      .from('business_company_categories')
      .select('category:business_categories(kind, name)')
      .eq('organization_id', organizationId)
      .eq('company_id', companyId),
    supabase
      .from('business_person_companies')
      .select('id, person_id, position_or_role, is_primary_contact, person:business_people(first_name, last_name, email, primary_phone)')
      .eq('organization_id', organizationId)
      .eq('company_id', companyId)
      .eq('status', 'active'),
    getOrgFeatures(organizationId),
  ])
  if (companyRes.error) throw new Error('company_preview_failed')
  const company = companyRes.data
  if (!company) return notFound('Company')

  const subcontractorId = (company.subcontractor_company_id as string | null) ?? null
  const subcontractorsEnabled = Boolean(features.subcontractors)
  const contactRows = (contactsRes.data ?? []) as unknown as CompanyContactRow[]
  const relationshipIds = contactRows.map((row) => row.id)

  const [personProjectsRes, assignmentsRes, tradeRes] = await Promise.all([
    relationshipIds.length
      ? supabase
          .from('business_person_projects')
          .select('person_company_id, project_role, project:projects(id, name, project_number)')
          .eq('organization_id', organizationId)
          .eq('status', 'active')
          .in('person_company_id', relationshipIds)
      : Promise.resolve({ data: [], error: null }),
    subcontractorId && subcontractorsEnabled
      ? supabase
          .from('subcontractor_project_assignments')
          .select('project:projects(id, name, project_number)')
          .eq('organization_id', organizationId)
          .eq('subcontractor_company_id', subcontractorId)
          .is('ended_at', null)
      : Promise.resolve({ data: [], error: null }),
    subcontractorId && subcontractorsEnabled
      ? supabase.from('subcontractor_companies').select('trade').eq('organization_id', organizationId).eq('id', subcontractorId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const nameByRelationship = new Map(contactRows.map((row) => [row.id, row.person ? personName(row.person) : 'Unknown contact']))
  const toRef = (p: NonNullable<ProjectJoin>) => ({ id: p.id, name: p.name, number: p.project_number })
  const personProjects = (personProjectsRes.data ?? []) as unknown as {
    person_company_id: string
    project_role: string | null
    project: ProjectJoin
  }[]
  const assignments = (assignmentsRes.data ?? []) as unknown as { project: ProjectJoin }[]
  const categoryLinks = (categoriesRes.data ?? []) as unknown as { category: { kind: string; name: string } | null }[]
  const address = formatAddress({ address_line1: company.address_line1, city: company.city, state: company.state, postal_code: company.postal_code })

  return {
    ok: true,
    preview: {
      kind: 'company',
      id: company.id,
      status: company.status,
      email: company.company_email,
      phone: company.company_phone,
      secondaryPhone: company.secondary_company_phone,
      website: company.website?.trim() || null,
      address: address === '—' ? null : address,
      subcontractor: subcontractorId
        ? {
            href: subcontractorsEnabled ? `/subcontractors/${subcontractorId}` : null,
            trade: ((tradeRes.data as { trade: string | null } | null)?.trade ?? '').trim() || null,
          }
        : null,
      categories: categoryLinks.flatMap((link) => {
        const key = link.category?.kind === 'business' ? categoryKeyFromName(link.category.name) : null
        return key ? [CATEGORY_LABELS[key]] : []
      }),
      productCategories: categoryLinks
        .flatMap((link) => (link.category?.kind === 'product' ? [link.category.name] : []))
        .sort((a, b) => a.localeCompare(b)),
      contacts: contactsRes.error
        ? null
        : contactRows
            .map((row) => ({
              id: row.person_id,
              name: nameByRelationship.get(row.id) ?? 'Unknown contact',
              role: row.position_or_role,
              primary: row.is_primary_contact,
              email: row.person?.email ?? null,
              phone: row.person?.primary_phone ?? null,
              href: `/contacts/people/${row.person_id}`,
            }))
            .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name)),
      projects:
        contactsRes.error || personProjectsRes.error || assignmentsRes.error
          ? null
          : mergeCompanyProjects(
              assignments.flatMap((row) => (row.project ? [toRef(row.project)] : [])),
              personProjects.flatMap((row) =>
                row.project
                  ? [{ ...toRef(row.project), person: nameByRelationship.get(row.person_company_id) ?? 'Unknown contact', role: row.project_role }]
                  : [],
              ),
            ),
      notes: company.notes?.trim() || null,
    },
  }
}

// ============ Clients ============

type ClientProjectRow = { id: string; name: string; project_number: string | null; status: ProjectStatus }

/** Any staff member may open the preview; row-level security decides which clients, contacts, and projects they see. */
export async function loadClientPreview(clientId: string): Promise<PreviewResult<ClientPreview>> {
  if (!UUID.test(clientId)) return notFound('Client')
  const viewer = await resolveViewer('staff')
  if (!viewer.ok) return viewer
  const { supabase, organizationId, manager, admin } = viewer

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, first_name, middle_name, last_name, email, phone, preferred_communication, notes, portal_user_id')
    .eq('id', clientId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error('client_preview_failed')
  if (!client) return notFound('Client')

  const [contactsRes, projects, portal] = await Promise.all([
    supabase
      .from('client_contacts')
      .select('id, first_name, middle_name, last_name, relationship, email, phone, preferred_communication, is_primary')
      .eq('client_id', client.id)
      .is('archived_at', null)
      .order('is_primary', { ascending: false })
      .order('last_name'),
    loadClientProjects(supabase, organizationId, client.id),
    manager ? loadClientPortal(supabase, organizationId, client, admin) : Promise.resolve<ClientPortal>({ state: 'hidden' }),
  ])

  return {
    ok: true,
    preview: {
      id: client.id,
      contacts: contactsRes.error
        ? { state: 'error' }
        : { state: 'ready', ...pickClientContacts(client, (contactsRes.data ?? []) as ClientContactRow[]) },
      projects,
      portal,
      notes: client.notes?.trim() || null,
      contactsHref: `/clients/${client.id}#contacts`,
      createProjectHref: manager ? `/projects/new?client=${client.id}` : null,
    },
  }
}

/** A client's projects: those it is the primary homeowner of, plus any it is linked to as a co-owner. */
async function loadClientProjects(supabase: Supabase, organizationId: string, clientId: string): Promise<ClientPreview['projects']> {
  const [primaryRes, linksRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, project_number, status')
      .eq('organization_id', organizationId)
      .eq('primary_client_id', clientId),
    supabase.from('project_clients').select('project_id').eq('client_id', clientId),
  ])
  if (primaryRes.error || linksRes.error) return { state: 'error' }

  const byId = new Map(((primaryRes.data ?? []) as ClientProjectRow[]).map((p) => [p.id, p]))
  const missing = [...new Set(((linksRes.data ?? []) as { project_id: string }[]).map((l) => l.project_id))].filter((id) => !byId.has(id))
  if (missing.length) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, project_number, status')
      .eq('organization_id', organizationId)
      .in('id', missing)
    if (error) return { state: 'error' }
    for (const p of (data ?? []) as ClientProjectRow[]) byId.set(p.id, p)
  }

  const items: ClientPreviewProject[] = [...byId.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, number: p.project_number, status: p.status, href: `/projects/${p.id}` }))
  return { state: 'ready', items }
}

/**
 * Read-only: reports the access that exists and never grants any. Administrators see the client's portal logins;
 * project managers see what the client record and its pending invitation say, as on the client's own page.
 */
async function loadClientPortal(
  supabase: Supabase,
  organizationId: string,
  client: { id: string; portal_user_id: string | null },
  admin: boolean,
): Promise<ClientPortal> {
  const manageHref = `/clients/${client.id}#portal-access`
  const features = await getOrgFeatures(organizationId)
  if (!features.portal) return { state: 'ready', status: 'portal_off', detail: null, manageHref }

  if (admin) {
    const { data: accounts, error } = await supabase.from('portal_accounts').select('user_id').eq('client_id', client.id)
    if (error) return { state: 'error' }
    const userIds = (accounts ?? []).map((a) => a.user_id as string)
    if (userIds.length) {
      const { data: memberships, error: membershipError } = await supabase
        .from('organization_memberships')
        .select('user_id, status, activation_required')
        .eq('organization_id', organizationId)
        .in('user_id', userIds)
      if (membershipError) return { state: 'error' }
      const byUser = new Map((memberships ?? []).map((m) => [m.user_id as string, m]))
      const summary = summarizePortalAccounts(
        userIds.map((id) => ({
          status: (byUser.get(id)?.status as string | undefined) ?? null,
          activationRequired: Boolean(byUser.get(id)?.activation_required),
        })),
      )
      if (summary) return { state: 'ready', ...summary, manageHref }
    }
  } else if (client.portal_user_id) {
    return { state: 'ready', status: 'active', detail: null, manageHref }
  }

  const { data: invites, error: inviteError } = await supabase
    .from('invitations')
    .select('id')
    .eq('client_id', client.id)
    .eq('status', 'pending')
    .limit(1)
  if (inviteError) return { state: 'error' }
  return invites?.length
    ? { state: 'ready', status: 'invited', detail: 'They gain access once they sign up and confirm their email.', manageHref }
    : { state: 'ready', status: 'not_provisioned', detail: null, manageHref }
}
