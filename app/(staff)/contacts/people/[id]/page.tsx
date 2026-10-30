import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatPhone } from '@/lib/format'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadCompanyOptions, loadPersonProfile } from '@/lib/contacts-data'
import { loadAssignableProjects } from '@/lib/subcontractor-detail-data'
import { personName } from '@/lib/contacts'
import { DetailList, PageContainer, PageHeader, Surface } from '@/components/shared/page-header'
import { ContactStatusBadge, ContactStatusButton } from '@/components/contacts/contact-status-button'
import { PersonCompanies, PersonProjects } from '@/components/contacts/person-relationships'

export const metadata: Metadata = { title: 'Contact' }

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()
  const [person, companies, assignable] = await Promise.all([
    loadPersonProfile(supabase, session.organizationId, id),
    loadCompanyOptions(supabase, session.organizationId),
    loadAssignableProjects(supabase, session.organizationId),
  ])
  if (!person) notFound()
  const name = personName(person)
  const inactive = person.status === 'inactive'

  return (
    <PageContainer width="narrow">
      <PageHeader
        title={name}
        description={person.specialty ?? 'Business contact'}
        avatar={
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sage font-semibold text-primary ring-1 ring-inset ring-primary/10">
            {initials(person.first_name, person.last_name)}
          </span>
        }
        titleAddon={<ContactStatusBadge status={person.status} />}
        backHref="/contacts?view=people"
        backLabel="Contacts"
        actions={
          <>
            <ContactStatusButton
              kind="person"
              id={person.id}
              name={name}
              status={person.status}
              activeProjectCount={person.projects.filter((p) => p.status === 'active').length}
            />
            <Button size="lg" render={<Link href={`/contacts/people/${person.id}/edit`} />} nativeButton={false}>
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
          </>
        }
      />

      <Surface>
        <DetailList
          items={[
            { label: 'Email', value: person.email ? <a href={`mailto:${person.email}`} className="underline-offset-4 hover:underline">{person.email}</a> : '—' },
            { label: 'Primary phone', value: person.primary_phone ? formatPhone(person.primary_phone) : '—' },
            { label: 'Secondary phone', value: person.secondary_phone ? formatPhone(person.secondary_phone) : '—' },
            { label: 'Specialty', value: person.specialty ?? '—' },
            { label: 'Added', value: formatDate(person.created_at) },
            { label: 'Notes', value: person.notes ? <span className="whitespace-pre-line">{person.notes}</span> : '—' },
          ]}
        />
      </Surface>

      <PersonCompanies personId={person.id} relationships={person.relationships} companies={companies} canEdit personInactive={inactive} />
      <PersonProjects
        personId={person.id}
        associations={person.projects}
        projects={assignable.projects}
        relationships={person.relationships}
        canEdit
        personInactive={inactive}
      />
    </PageContainer>
  )
}
