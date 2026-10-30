import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadPersonProfile } from '@/lib/contacts-data'
import { personName } from '@/lib/contacts'
import { updatePersonAction } from '@/app/actions/contacts'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { PersonForm } from '@/components/contacts/person-form'

export const metadata: Metadata = { title: 'Edit contact' }

export default async function EditPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const person = await loadPersonProfile(await createClient(), session.organizationId, id)
  if (!person) notFound()
  const href = `/contacts/people/${person.id}`
  return (
    <PageContainer width="form">
      <PageHeader icon={Pencil} title={`Edit ${personName(person)}`} backHref={href} backLabel="Contact" />
      <PersonForm action={updatePersonAction.bind(null, person.id)} cancelHref={href} person={person} />
    </PageContainer>
  )
}
