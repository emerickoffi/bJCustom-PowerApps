import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { personName, type ContactStatus } from '@/lib/contacts'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type ProjectContact = {
  association_id: string
  person_id: string
  name: string
  first_name: string
  last_name: string
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  person_status: ContactStatus
  company_name: string | null
  project_role: string
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
}

/** Explicit company-to-project assignment plus the company's active directory contacts (not auto-assigned). */
export type ProjectCompanyContacts = {
  subcontractor_company_id: string
  company_name: string
  directory_company_id: string | null
  people: { person_id: string; name: string; role: string | null; relationship_id: string; person_status: ContactStatus }[]
}

export type AssignablePerson = {
  id: string
  label: string
  companies: { relationship_id: string; company_name: string }[]
}

export type ProjectContactsData =
  | { availability: 'setup-required' }
  | {
      availability: 'ready'
      contacts: ProjectContact[]
      companies: ProjectCompanyContacts[]
      assignable: AssignablePerson[]
    }

function isMissing(error: { code?: string } | null | undefined) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

type AssocRow = {
  id: string
  person_id: string
  project_role: string
  status: 'active' | 'ended'
  started_at: string
  ended_at: string | null
  person: { first_name: string; last_name: string; email: string | null; primary_phone: string | null; secondary_phone: string | null; status: ContactStatus } | null
  via: { company: { company_name: string } | null } | null
}

/** One batched load: associations, company assignments, and the picker data. No per-row queries. */
export async function loadProjectContacts(supabase: Supabase, organizationId: string, projectId: string): Promise<ProjectContactsData> {
  const [assocRes, subRes, peopleRes] = await Promise.all([
    supabase
      .from('business_person_projects')
      .select(
        'id, person_id, project_role, status, started_at, ended_at, person:business_people(first_name, last_name, email, primary_phone, secondary_phone, status), via:business_person_companies!person_company_id(company:business_companies(company_name))',
      )
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .order('status')
      .order('started_at', { ascending: false }),
    supabase
      .from('subcontractor_project_assignments')
      .select('subcontractor_company_id, company:subcontractor_companies(company_name)')
      .eq('organization_id', organizationId)
      .eq('project_id', projectId)
      .is('ended_at', null),
    supabase
      .from('business_people')
      .select('id, first_name, last_name, email, companies:business_person_companies(id, status, company:business_companies(company_name))')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .order('last_name')
      .limit(5000),
  ])
  if (isMissing(assocRes.error)) return { availability: 'setup-required' }

  const contacts: ProjectContact[] = ((assocRes.data ?? []) as unknown as AssocRow[]).map((r) => ({
    association_id: r.id,
    person_id: r.person_id,
    name: r.person ? personName(r.person) : 'Unknown contact',
    first_name: r.person?.first_name ?? '',
    last_name: r.person?.last_name ?? 'Unknown contact',
    email: r.person?.email ?? null,
    primary_phone: r.person?.primary_phone ?? null,
    secondary_phone: r.person?.secondary_phone ?? null,
    person_status: r.person?.status ?? 'inactive',
    company_name: r.via?.company?.company_name ?? null,
    project_role: r.project_role,
    status: r.status,
    started_at: r.started_at,
    ended_at: r.ended_at,
  }))

  const subs = (subRes.data ?? []) as unknown as { subcontractor_company_id: string; company: { company_name: string } | null }[]
  const subIds = [...new Set(subs.map((s) => s.subcontractor_company_id))]
  let companies: ProjectCompanyContacts[] = []
  if (subIds.length) {
    const { data: linked } = await supabase
      .from('business_companies')
      .select(
        'id, subcontractor_company_id, people:business_person_companies(id, position_or_role, status, person:business_people(id, first_name, last_name, status))',
      )
      .eq('organization_id', organizationId)
      .in('subcontractor_company_id', subIds)
    type LinkedRow = {
      id: string
      subcontractor_company_id: string
      people: { id: string; position_or_role: string | null; status: string; person: { id: string; first_name: string; last_name: string; status: ContactStatus } | null }[]
    }
    const bySub = new Map(((linked ?? []) as unknown as LinkedRow[]).map((c) => [c.subcontractor_company_id, c]))
    companies = subIds.map((sid) => {
      const dir = bySub.get(sid)
      return {
        subcontractor_company_id: sid,
        company_name: subs.find((s) => s.subcontractor_company_id === sid)?.company?.company_name ?? 'Subcontractor',
        directory_company_id: dir?.id ?? null,
        people: (dir?.people ?? [])
          .filter((p) => p.status === 'active' && p.person)
          .map((p) => ({
            person_id: p.person!.id,
            name: personName(p.person!),
            role: p.position_or_role,
            relationship_id: p.id,
            person_status: p.person!.status,
          })),
      }
    })
    companies.sort((a, b) => a.company_name.localeCompare(b.company_name))
  }

  type PersonOpt = {
    id: string
    first_name: string
    last_name: string
    email: string | null
    companies: { id: string; status: string; company: { company_name: string } | null }[]
  }
  const assignable: AssignablePerson[] = ((peopleRes.data ?? []) as unknown as PersonOpt[]).map((p) => ({
    id: p.id,
    label: p.email ? `${personName(p)} (${p.email})` : personName(p),
    companies: (p.companies ?? [])
      .filter((c) => c.status === 'active' && c.company)
      .map((c) => ({ relationship_id: c.id, company_name: c.company!.company_name })),
  }))

  return { availability: 'ready', contacts, companies, assignable }
}
