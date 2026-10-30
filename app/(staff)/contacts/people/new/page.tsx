import type { Metadata } from 'next'
import { UserPlus } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadCompanyOptions } from '@/lib/contacts-data'
import { createPersonAction } from '@/app/actions/contacts'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { PersonForm } from '@/components/contacts/person-form'

export const metadata: Metadata = { title: 'Add contact' }

export default async function NewPersonPage() {
  const session = await requireManager()
  const companies = await loadCompanyOptions(await createClient(), session.organizationId)
  return (
    <PageContainer width="form">
      <PageHeader icon={UserPlus} title="Add contact" description="Add a person to your business directory." backHref="/contacts?view=people" backLabel="Contacts" />
      <PersonForm action={createPersonAction} cancelHref="/contacts?view=people" companies={companies} />
    </PageContainer>
  )
}
