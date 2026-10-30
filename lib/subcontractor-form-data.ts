import 'server-only'
import type { createClient } from '@/lib/supabase/server'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { isMissingTableError, type SubcontractorCompany } from '@/lib/subcontractors'
import { isAssignmentSetupError, splitProjectAssignments, type AssignableProject } from '@/lib/subcontractor-projects'
import {
  loadActiveWorkByProject,
  loadAssignableProjects,
  loadProjectAssignments,
  loadSubcontractor,
} from '@/lib/subcontractor-detail-data'
import type { ContactPersonOption, CurrentContactPerson } from '@/lib/subcontractor-contact-persons'
import type { ExistingAssignments, ProjectPickerAvailability } from '@/components/subcontractors/project-assignments-picker'

type Supabase = Awaited<ReturnType<typeof createClient>>

export type ContactsAvailability = 'ready' | 'setup-required' | 'error'

/** Everything the shared Add/Edit Subcontractor form needs, loaded once for both the page and the drawer. */
export type SubcontractorFormData = {
  projects: AssignableProject[]
  projectAvailability: ProjectPickerAvailability
  people: ContactPersonOption[]
  contactsAvailability: ContactsAvailability
  company?: SubcontractorCompany
  existingAssignments?: ExistingAssignments
  currentContacts?: CurrentContactPerson[]
}

const PERSON_COLUMNS =
  'id, first_name, last_name, email, primary_phone, secondary_phone, companies:business_person_companies(position_or_role, status, company:business_companies(company_name))'

type PersonRow = {
  id: string
  first_name: string
  last_name: string
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  companies: { position_or_role: string | null; status: string; company: { company_name: string } | null }[] | null
}

function toOption(row: PersonRow): ContactPersonOption {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    primary_phone: row.primary_phone,
    secondary_phone: row.secondary_phone,
    companies: (row.companies ?? [])
      .filter((c) => c.status === 'active' && c.company)
      .map((c) => ({ name: c.company!.company_name, role: c.position_or_role })),
  }
}

async function loadPeople(supabase: Supabase, organizationId: string) {
  const { data, error } = await supabase
    .from('business_people')
    .select(PERSON_COLUMNS)
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('last_name')
    .order('first_name')
    .limit(2000)
  const availability: ContactsAvailability = error ? (isMissingTableError(error) ? 'setup-required' : 'error') : 'ready'
  return { availability, people: ((data ?? []) as unknown as PersonRow[]).map(toOption) }
}

/** Active person relationships on the Contacts company linked to this subcontractor. */
async function loadCurrentContacts(supabase: Supabase, organizationId: string, subcontractorId: string) {
  const { data: company, error } = await supabase
    .from('business_companies')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('subcontractor_company_id', subcontractorId)
    .maybeSingle()
  if (error || !company) return { ok: !error, contacts: [] as CurrentContactPerson[] }
  const { data, error: relError } = await supabase
    .from('business_person_companies')
    .select(`id, position_or_role, is_primary_contact, person:business_people(${PERSON_COLUMNS})`)
    .eq('organization_id', organizationId)
    .eq('company_id', company.id)
    .eq('status', 'active')
    .order('is_primary_contact', { ascending: false })
    .order('created_at')
  if (relError) return { ok: false, contacts: [] as CurrentContactPerson[] }
  const rows = (data ?? []) as unknown as { id: string; position_or_role: string | null; is_primary_contact: boolean; person: PersonRow | null }[]
  return {
    ok: true,
    contacts: rows
      .filter((r) => r.person)
      .map((r) => ({ relationship_id: r.id, person: toOption(r.person!), role: r.position_or_role, is_primary: r.is_primary_contact })),
  }
}

export async function loadNewSubcontractorFormData(supabase: Supabase, organizationId: string): Promise<SubcontractorFormData> {
  const [assignable, storageProbe, people] = await Promise.all([
    loadAssignableProjects(supabase, organizationId),
    supabase.from('subcontractor_project_assignments').select('id, ended_at').limit(1),
    loadPeople(supabase, organizationId),
  ])
  const projectAvailability: ProjectPickerAvailability = isAssignmentSetupError(storageProbe.error)
    ? 'setup-required'
    : assignable.error || storageProbe.error
      ? 'error'
      : 'ready'
  return {
    projects: assignable.projects,
    projectAvailability,
    people: people.people,
    contactsAvailability: people.availability,
  }
}

/** Null when the company does not exist in the caller's organization. */
export async function loadEditSubcontractorFormData(
  supabase: Supabase,
  organizationId: string,
  companyId: string,
): Promise<SubcontractorFormData | null> {
  const company = await loadSubcontractor(supabase, organizationId, companyId)
  if (!company) return null
  const [associated, assignable, activeWork, people, current] = await Promise.all([
    loadProjectAssignments(supabase, organizationId, companyId),
    loadAssignableProjects(supabase, organizationId),
    loadActiveWorkByProject(supabase, organizationId, companyId),
    loadPeople(supabase, organizationId),
    loadCurrentContacts(supabase, organizationId, companyId),
  ])
  const { current: currentAssignments, history } = splitProjectAssignments(associated.records, projectAcceptsNewAssignments)
  const currentIds = new Set(currentAssignments.map((r) => r.project.id))
  return {
    company,
    projects: assignable.projects.filter((p) => !currentIds.has(p.id)),
    projectAvailability: associated.availability !== 'ready' ? associated.availability : assignable.error ? 'error' : 'ready',
    existingAssignments: { companyId, current: currentAssignments, history, activeWork, inactive: company.status !== 'active' },
    people: people.people,
    contactsAvailability: people.availability !== 'ready' ? people.availability : current.ok ? 'ready' : 'error',
    currentContacts: current.contacts,
  }
}
