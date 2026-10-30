import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadAssignableProjectOptions, loadCompanyOptions, loadPersonProfile } from '@/lib/contacts-data'
import { personName } from '@/lib/contacts'
import { updatePersonAction } from '@/app/actions/contacts'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { PersonForm } from '@/components/contacts/person-form'

export const metadata: Metadata = { title: 'Edit contact' }

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()
  const [person, companies, projects] = await Promise.all([
    loadPersonProfile(supabase, session.organizationId, id),
    loadCompanyOptions(supabase, session.organizationId),
    loadAssignableProjectOptions(supabase, session.organizationId),
  ])
  if (!person) notFound()
  const href = `/contacts/people/${person.id}`
  const currentCompanies = person.relationships
    .filter((r) => r.status === 'active')
    .map((r) => ({ company_id: r.company_id, company_name: r.company_name, role: r.role, is_primary_contact: r.is_primary_contact }))
  const currentProjects = person.projects
    .filter((p) => p.status === 'active')
    .map((p) => ({ project_id: p.project_id, name: p.name, project_number: p.project_number, project_role: p.project_role }))
  return (
    <PageContainer width="form">
      <PageHeader icon={Pencil} title={`Edit ${personName(person)}`} backHref={href} backLabel="Contact" />
      <PersonForm
        action={updatePersonAction.bind(null, person.id)}
        cancelHref={href}
        person={person}
        companies={companies}
        projects={person.status === 'active' ? projects : []}
        currentCompanies={currentCompanies}
        currentProjects={currentProjects}
      />
    </PageContainer>
  )
}
