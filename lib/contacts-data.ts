import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import {
  categoryKeyFromName,
  deriveCompanyCategories,
  derivePersonCategories,
  personName,
  uniqueProjects,
  type CategoryKey,
  type CompanyView,
  type ContactStatus,
  type PersonView,
  type ProjectLink,
} from '@/lib/contacts'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type DirectoryAvailability = 'ready' | 'setup-required' | 'error'

const MAX_ROWS = 5000

function isMissing(error: { code?: string } | null | undefined) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

type PersonRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  specialty: string | null
  status: ContactStatus
  updated_at: string
}
type CompanyRow = {
  id: string
  company_name: string
  company_email: string | null
  company_phone: string | null
  status: ContactStatus
  subcontractor_company_id: string | null
  /** Read from the linked subcontractor; only visible to roles that can read subcontractor records. */
  trade?: string | null
}
type RelationshipRow = {
  id: string
  person_id: string
  company_id: string
  position_or_role: string | null
  is_primary_contact: boolean
}
type CategoryLinkRow = { company_id: string; category: { kind: string; name: string } | null }
type PersonProjectRow = {
  id: string
  person_id: string
  person_company_id: string | null
  project_role: string
  project: { id: string; name: string; project_number: string | null } | null
}
type SubAssignmentRow = {
  subcontractor_company_id: string
  project: { id: string; name: string; project_number: string | null } | null
}

const PERSON_COLUMNS = 'id, first_name, last_name, email, primary_phone, secondary_phone, specialty, status, updated_at'
const COMPANY_COLUMNS = 'id, company_name, company_email, company_phone, status, subcontractor_company_id'

/**
 * Loads the whole organization directory and assembles people and company view models. Only active relationships and
 * project associations are included here; history is loaded on the profile pages.
 */
export async function loadDirectory(
  supabase: Supabase,
  organizationId: string,
): Promise<{ availability: DirectoryAvailability; people: PersonView[]; companies: CompanyView[] }> {
  const [people, companies, rels, cats, personProjects, subAssignments] = await Promise.all([
    supabase.from('business_people').select(PERSON_COLUMNS).eq('organization_id', organizationId).limit(MAX_ROWS),
    supabase
      .from('business_companies')
      .select(`${COMPANY_COLUMNS}, subcontractor:subcontractor_companies(trade)`)
      .eq('organization_id', organizationId)
      .limit(MAX_ROWS),
    supabase
      .from('business_person_companies')
      .select('id, person_id, company_id, position_or_role, is_primary_contact')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .limit(MAX_ROWS * 2),
    supabase
      .from('business_company_categories')
      .select('company_id, category:business_categories(kind, name)')
      .eq('organization_id', organizationId)
      .limit(MAX_ROWS * 4),
    supabase
      .from('business_person_projects')
      .select('id, person_id, person_company_id, project_role, project:projects(id, name, project_number)')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .limit(MAX_ROWS * 4),
    supabase
      .from('subcontractor_project_assignments')
      .select('subcontractor_company_id, project:projects(id, name, project_number)')
      .eq('organization_id', organizationId)
      .is('ended_at', null)
      .limit(MAX_ROWS * 4),
  ])

  const core = [people.error, companies.error, rels.error, cats.error, personProjects.error]
  if (core.some(isMissing)) return { availability: 'setup-required', people: [], companies: [] }
  if (core.some(Boolean)) return { availability: 'error', people: [], companies: [] }

  return {
    availability: 'ready',
    ...assembleDirectory(
      (people.data ?? []) as PersonRow[],
      ((companies.data ?? []) as unknown as (CompanyRow & { subcontractor: { trade: string | null } | null })[]).map(
        ({ subcontractor, ...c }) => ({ ...c, trade: subcontractor?.trade ?? null }),
      ),
      (rels.data ?? []) as RelationshipRow[],
      (cats.data ?? []) as unknown as CategoryLinkRow[],
      (personProjects.data ?? []) as unknown as PersonProjectRow[],
      // Subcontractor assignments are optional context; a missing table or restricted read simply contributes nothing.
      subAssignments.error ? [] : ((subAssignments.data ?? []) as unknown as SubAssignmentRow[]),
    ),
  }
}

function assembleDirectory(
  peopleRows: PersonRow[],
  companyRows: CompanyRow[],
  rels: RelationshipRow[],
  cats: CategoryLinkRow[],
  personProjects: PersonProjectRow[],
  subAssignments: SubAssignmentRow[],
): { people: PersonView[]; companies: CompanyView[] } {
  const companyById = new Map(companyRows.map((c) => [c.id, c]))
  const personById = new Map(peopleRows.map((p) => [p.id, p]))

  const businessCats = new Map<string, CategoryKey[]>()
  const productCats = new Map<string, string[]>()
  for (const link of cats) {
    if (!link.category) continue
    if (link.category.kind === 'product') {
      productCats.set(link.company_id, [...(productCats.get(link.company_id) ?? []), link.category.name])
    } else {
      const key = categoryKeyFromName(link.category.name)
      if (key) businessCats.set(link.company_id, [...(businessCats.get(link.company_id) ?? []), key])
    }
  }

  const companyCategories = new Map<string, CategoryKey[]>()
  for (const c of companyRows) {
    companyCategories.set(c.id, deriveCompanyCategories(businessCats.get(c.id) ?? [], Boolean(c.subcontractor_company_id)))
  }

  const relsByPerson = new Map<string, RelationshipRow[]>()
  const relsByCompany = new Map<string, RelationshipRow[]>()
  const relById = new Map<string, RelationshipRow>()
  for (const r of rels) {
    if (!companyById.has(r.company_id) || !personById.has(r.person_id)) continue
    relsByPerson.set(r.person_id, [...(relsByPerson.get(r.person_id) ?? []), r])
    relsByCompany.set(r.company_id, [...(relsByCompany.get(r.company_id) ?? []), r])
    relById.set(r.id, r)
  }

  const projectsByPerson = new Map<string, ProjectLink[]>()
  const projectsByCompany = new Map<string, ProjectLink[]>()
  for (const pp of personProjects) {
    if (!pp.project) continue
    const link: ProjectLink = {
      association_id: pp.id,
      project_id: pp.project.id,
      name: pp.project.name,
      project_number: pp.project.project_number,
      role: pp.project_role,
    }
    projectsByPerson.set(pp.person_id, [...(projectsByPerson.get(pp.person_id) ?? []), link])
    const rel = pp.person_company_id ? relById.get(pp.person_company_id) : undefined
    if (rel) projectsByCompany.set(rel.company_id, [...(projectsByCompany.get(rel.company_id) ?? []), link])
  }
  const companyBySub = new Map(companyRows.filter((c) => c.subcontractor_company_id).map((c) => [c.subcontractor_company_id!, c.id]))
  for (const a of subAssignments) {
    const companyId = companyBySub.get(a.subcontractor_company_id)
    if (!companyId || !a.project) continue
    projectsByCompany.set(companyId, [
      ...(projectsByCompany.get(companyId) ?? []),
      { project_id: a.project.id, name: a.project.name, project_number: a.project.project_number },
    ])
  }

  const people: PersonView[] = peopleRows.map((p) => {
    const links = (relsByPerson.get(p.id) ?? [])
      .map((r) => ({
        relationship_id: r.id,
        company_id: r.company_id,
        company_name: companyById.get(r.company_id)!.company_name,
        role: r.position_or_role,
        is_primary_contact: r.is_primary_contact,
      }))
      .sort((a, b) => Number(b.is_primary_contact) - Number(a.is_primary_contact) || a.company_name.localeCompare(b.company_name))
    return {
      ...p,
      companies: links,
      categories: derivePersonCategories(links.map((l) => companyCategories.get(l.company_id) ?? []), p.specialty),
      projects: (projectsByPerson.get(p.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
    }
  })

  const companies: CompanyView[] = companyRows.map((c) => {
    const contacts = relsByCompany.get(c.id) ?? []
    const primary = contacts.find((r) => r.is_primary_contact)
    const primaryPerson = primary ? personById.get(primary.person_id) : undefined
    return {
      ...c,
      categories: companyCategories.get(c.id) ?? ['other'],
      product_categories: (productCats.get(c.id) ?? []).sort((a, b) => a.localeCompare(b)),
      primary_contact: primaryPerson ? { person_id: primaryPerson.id, name: personName(primaryPerson) } : null,
      contact_count: contacts.length,
      projects: uniqueProjects(projectsByCompany.get(c.id) ?? []),
    }
  })

  return { people, companies }
}

// ============ Profiles ============

export type RelationshipHistory = {
  id: string
  company_id: string
  company_name: string
  role: string | null
  is_primary_contact: boolean
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}

export type ProjectAssociation = {
  id: string
  project_id: string
  name: string
  project_number: string | null
  project_role: string
  person_company_id: string | null
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}

export type PersonProfile = PersonRow & {
  middle_name: string | null
  notes: string | null
  created_at: string
  relationships: RelationshipHistory[]
  projects: ProjectAssociation[]
}

export async function loadPersonProfile(
  supabase: Supabase,
  organizationId: string,
  personId: string,
): Promise<PersonProfile | null> {
  const { data: person } = await supabase
    .from('business_people')
    .select(`${PERSON_COLUMNS}, middle_name, notes, created_at`)
    .eq('organization_id', organizationId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return null
  const [rels, projects] = await Promise.all([
    supabase
      .from('business_person_companies')
      .select('id, company_id, position_or_role, is_primary_contact, status, started_at, ended_at, company:business_companies(company_name)')
      .eq('organization_id', organizationId)
      .eq('person_id', personId)
      .order('status')
      .order('started_at', { ascending: false }),
    supabase
      .from('business_person_projects')
      .select('id, project_id, project_role, person_company_id, status, started_at, ended_at, project:projects(name, project_number)')
      .eq('organization_id', organizationId)
      .eq('person_id', personId)
      .order('status')
      .order('started_at', { ascending: false }),
  ])
  /* eslint-disable @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST */
  return {
    ...(person as PersonProfile),
    relationships: ((rels.data ?? []) as any[]).map((r) => ({
      id: r.id,
      company_id: r.company_id,
      company_name: r.company?.company_name ?? 'Unknown company',
      role: r.position_or_role,
      is_primary_contact: r.is_primary_contact,
      status: r.status,
      started_at: r.started_at,
      ended_at: r.ended_at,
    })),
    projects: ((projects.data ?? []) as any[]).map((p) => ({
      id: p.id,
      project_id: p.project_id,
      name: p.project?.name ?? 'Unknown project',
      project_number: p.project?.project_number ?? null,
      project_role: p.project_role,
      person_company_id: p.person_company_id,
      status: p.status,
      started_at: p.started_at,
      ended_at: p.ended_at,
    })),
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export type CompanyContact = {
  relationship_id: string
  person_id: string
  name: string
  email: string | null
  primary_phone: string | null
  person_status: ContactStatus
  role: string | null
  is_primary_contact: boolean
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}

export type CompanyDetails = {
  secondary_company_phone: string | null
  website: string | null
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
}

export type CompanyProfile = CompanyRow & CompanyDetails & {
  notes: string | null
  created_at: string
  business_categories: CategoryKey[]
  product_categories: string[]
  contacts: CompanyContact[]
}

export async function loadCompanyProfile(
  supabase: Supabase,
  organizationId: string,
  filter: { id: string } | { subcontractorId: string },
): Promise<CompanyProfile | null> {
  let query = supabase
    .from('business_companies')
    .select(`${COMPANY_COLUMNS}, secondary_company_phone, website, address_line1, city, state, postal_code, notes, created_at`)
    .eq('organization_id', organizationId)
  query = 'id' in filter ? query.eq('id', filter.id) : query.eq('subcontractor_company_id', filter.subcontractorId)
  const { data: company } = await query.maybeSingle()
  if (!company) return null
  const [cats, contacts] = await Promise.all([
    supabase
      .from('business_company_categories')
      .select('category:business_categories(kind, name)')
      .eq('organization_id', organizationId)
      .eq('company_id', company.id),
    loadCompanyContacts(supabase, organizationId, company.id),
  ])
  const links = (cats.data ?? []) as unknown as { category: { kind: string; name: string } | null }[]
  return {
    ...(company as CompanyRow & CompanyDetails & { notes: string | null; created_at: string }),
    business_categories: links
      .filter((l) => l.category?.kind === 'business')
      .map((l) => categoryKeyFromName(l.category!.name))
      .filter((k): k is CategoryKey => Boolean(k)),
    product_categories: links.filter((l) => l.category?.kind === 'product').map((l) => l.category!.name).sort(),
    contacts,
  }
}

export async function loadCompanyContacts(supabase: Supabase, organizationId: string, companyId: string): Promise<CompanyContact[]> {
  const { data } = await supabase
    .from('business_person_companies')
    .select(
      'id, person_id, position_or_role, is_primary_contact, status, started_at, ended_at, person:business_people(first_name, last_name, email, primary_phone, status)',
    )
    .eq('organization_id', organizationId)
    .eq('company_id', companyId)
    .order('status')
    .order('is_primary_contact', { ascending: false })
    .order('started_at', { ascending: false })
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST */
  return ((data ?? []) as any[]).map((r) => ({
    relationship_id: r.id,
    person_id: r.person_id,
    name: r.person ? personName(r.person) : 'Unknown contact',
    email: r.person?.email ?? null,
    primary_phone: r.person?.primary_phone ?? null,
    person_status: r.person?.status ?? 'inactive',
    role: r.position_or_role,
    is_primary_contact: r.is_primary_contact,
    status: r.status,
    started_at: r.started_at,
    ended_at: r.ended_at,
  }))
}

/** Lightweight option lists for pickers. */
export async function loadCompanyOptions(supabase: Supabase, organizationId: string) {
  const { data } = await supabase
    .from('business_companies')
    .select('id, company_name, status')
    .eq('organization_id', organizationId)
    .order('company_name')
    .limit(MAX_ROWS)
  return (data ?? []) as { id: string; company_name: string; status: ContactStatus }[]
}

export async function loadPersonOptions(supabase: Supabase, organizationId: string) {
  const { data } = await supabase
    .from('business_people')
    .select('id, first_name, last_name, email, status')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('last_name')
    .limit(MAX_ROWS)
  return ((data ?? []) as { id: string; first_name: string; last_name: string; email: string | null }[]).map((p) => ({
    id: p.id,
    label: p.email ? `${personName(p)} (${p.email})` : personName(p),
  }))
}
