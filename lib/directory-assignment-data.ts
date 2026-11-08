import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { personName } from '@/lib/contacts'
import { EMAIL_DELIVERY, emailEligibility, suggestProjectRole, type EmailEligibility } from '@/lib/directory-assignment'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type AccountStatus = 'not_provisioned' | 'portal_active' | 'portal_revoked'

export type Affiliation = {
  relationship_id: string
  company_name: string
  position: string | null
  is_primary: boolean
}

export type DirectoryPersonRow = {
  kind: 'person'
  key: string
  id: string
  name: string
  email: string | null
  emailEligibility: EmailEligibility
  affiliations: Affiliation[]
  defaultRelationshipId: string | null
  suggestedRole: string
  account: AccountStatus
  manageAccessHref: string | null
  assigned: boolean
  disabledReason: string | null
  trade: string | null
}

export type DirectoryCompanyRow = {
  kind: 'company'
  key: string
  id: string
  name: string
  email: string | null
  peopleCount: number
  trade: string | null
  assigned: boolean
  disabledReason: string | null
}

export type DirectoryRow = DirectoryPersonRow | DirectoryCompanyRow

type Rel = {
  id: string
  status: string
  position_or_role: string | null
  is_primary_contact: boolean
  company: { id: string; company_name: string; subcontractor_company_id: string | null } | null
}

export async function loadDirectoryForAssignment(
  supabase: Supabase,
  organizationId: string,
  projectId: string,
  subcontractorsEnabled: boolean,
): Promise<{ availability: 'ready' | 'setup-required'; rows: DirectoryRow[] }> {
  const [peopleRes, companiesRes, personAssignRes, companyAssignRes, portalRes, tradesRes] = await Promise.all([
    supabase
      .from('business_people')
      .select(
        'id, first_name, last_name, email, status, companies:business_person_companies(id, status, position_or_role, is_primary_contact, company:business_companies(id, company_name, subcontractor_company_id))',
      )
      .eq('organization_id', organizationId)
      .order('last_name')
      .limit(5000),
    supabase
      .from('business_companies')
      .select('id, company_name, company_email, status, subcontractor_company_id')
      .eq('organization_id', organizationId)
      .order('company_name')
      .limit(5000),
    supabase.from('business_person_projects').select('person_id').eq('organization_id', organizationId).eq('project_id', projectId).eq('status', 'active'),
    subcontractorsEnabled
      ? supabase
          .from('subcontractor_project_assignments')
          .select('subcontractor_company_id')
          .eq('organization_id', organizationId)
          .eq('project_id', projectId)
          .is('ended_at', null)
      : Promise.resolve({ data: [] as { subcontractor_company_id: string }[], error: null }),
    supabase.from('subcontractor_portal_accounts').select('subcontractor_company_id, email, status').eq('organization_id', organizationId),
    subcontractorsEnabled
      ? supabase.from('subcontractor_companies').select('id, trade').eq('organization_id', organizationId)
      : Promise.resolve({ data: [] as { id: string; trade: string }[], error: null }),
  ])
  const tradeBySub = new Map<string, string>()
  for (const t of tradesRes.data ?? []) if (t.trade) tradeBySub.set(t.id as string, t.trade as string)

  if (peopleRes.error || companiesRes.error || personAssignRes.error) return { availability: 'setup-required', rows: [] }

  const assignedPeople = new Set((personAssignRes.data ?? []).map((r) => r.person_id as string))
  const assignedSubs = new Set((companyAssignRes.data ?? []).map((r) => r.subcontractor_company_id as string))
  const portal = new Map<string, string>()
  for (const a of portalRes.data ?? []) portal.set(`${a.subcontractor_company_id}:${String(a.email).toLowerCase()}`, a.status as string)

  const peopleCount = new Map<string, number>()
  const people: DirectoryPersonRow[] = (peopleRes.data ?? []).map((p) => {
    const rels = ((p.companies ?? []) as unknown as Rel[]).filter((r) => r.status === 'active' && r.company)
    const primary = rels.find((r) => r.is_primary_contact) ?? rels[0] ?? null
    for (const r of rels) peopleCount.set(r.company!.id, (peopleCount.get(r.company!.id) ?? 0) + 1)

    const email = (p.email as string | null) ?? null
    const subIds = rels.map((r) => r.company!.subcontractor_company_id).filter((v): v is string => !!v)
    const statuses = email ? subIds.map((s) => portal.get(`${s}:${email.toLowerCase()}`)).filter(Boolean) : []
    const account: AccountStatus = statuses.includes('active') ? 'portal_active' : statuses.includes('revoked') ? 'portal_revoked' : 'not_provisioned'

    return {
      kind: 'person',
      key: `person:${p.id}`,
      id: p.id as string,
      name: personName(p as { first_name: string; last_name: string }),
      email,
      emailEligibility: emailEligibility(email, EMAIL_DELIVERY),
      affiliations: rels.map((r) => ({
        relationship_id: r.id,
        company_name: r.company!.company_name,
        position: r.position_or_role,
        is_primary: r.is_primary_contact,
      })),
      defaultRelationshipId: primary?.id ?? null,
      suggestedRole: suggestProjectRole(primary?.position_or_role),
      account,
      manageAccessHref: subIds[0] && subcontractorsEnabled ? `/subcontractors/${subIds[0]}` : null,
      assigned: assignedPeople.has(p.id as string),
      disabledReason: p.status === 'inactive' ? 'Inactive contact' : null,
      trade: subIds.map((s) => tradeBySub.get(s)).find(Boolean) ?? null,
    }
  })

  const companies: DirectoryCompanyRow[] = (companiesRes.data ?? []).map((c) => {
    const subId = c.subcontractor_company_id as string | null
    let disabledReason: string | null = null
    if (c.status === 'inactive') disabledReason = 'Inactive company'
    else if (!subId) disabledReason = 'Not a subcontractor company. Assign its people individually.'
    else if (!subcontractorsEnabled) disabledReason = 'Subcontractor management is turned off.'
    return {
      kind: 'company',
      key: `company:${c.id}`,
      id: c.id as string,
      name: c.company_name as string,
      email: (c.company_email as string | null) ?? null,
      peopleCount: peopleCount.get(c.id as string) ?? 0,
      assigned: !!subId && assignedSubs.has(subId),
      disabledReason,
      trade: subId ? (tradeBySub.get(subId) ?? null) : null,
    }
  })

  return { availability: 'ready', rows: [...people, ...companies] }
}
