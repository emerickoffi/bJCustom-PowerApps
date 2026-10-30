import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, BookUser, Building2, FileUp, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadAssignableProjectOptions, loadCompanyOptions, loadDirectory, loadPersonProfile } from '@/lib/contacts-data'
import { CATEGORY_KEYS, DIRECTORY_VIEWS, type CategoryKey, type DirectoryView } from '@/lib/contacts'
import { isUuid } from '@/lib/subcontractor-projects'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared/page-header'
import { ContactsDirectory } from '@/components/contacts/contacts-directory'
import { ContactOverlays } from '@/components/contacts/contact-overlays'

export const metadata: Metadata = { title: 'Contacts' }

function addContactHref(params: { view?: string; category?: string }) {
  const qs = new URLSearchParams()
  if (params.view) qs.set('view', params.view)
  if (params.category) qs.set('category', params.category)
  qs.set('new', 'contact')
  return `/contacts?${qs}`
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; category?: string; new?: string; contact?: string; edit?: string }>
}) {
  const session = await requireManager()
  const params = await searchParams
  const view: DirectoryView = DIRECTORY_VIEWS.some((v) => v.value === params.view) ? (params.view as DirectoryView) : 'all'
  const category = CATEGORY_KEYS.includes(params.category as CategoryKey) ? (params.category as CategoryKey) : null
  const personId = [params.edit, params.contact].find((id) => id && isUuid(id)) ?? null
  const needsOptions = params.new === 'contact' || Boolean(params.edit && personId)

  const supabase = await createClient()
  const [{ availability, people, companies }, companyOptions, projectOptions, person] = await Promise.all([
    loadDirectory(supabase, session.organizationId),
    needsOptions ? loadCompanyOptions(supabase, session.organizationId) : Promise.resolve([]),
    needsOptions ? loadAssignableProjectOptions(supabase, session.organizationId) : Promise.resolve([]),
    personId ? loadPersonProfile(supabase, session.organizationId, personId) : Promise.resolve(null),
  ])

  return (
    <PageContainer>
      <PageHeader
        icon={BookUser}
        title="Contacts"
        description="Every person and business your team works with: architects, engineers, vendors, suppliers, and subcontractors."
        actions={
          availability === 'ready' && (
            <>
              <Button variant="outline" size="lg" render={<Link href="/contacts/import" />} nativeButton={false}>
                <FileUp data-icon="inline-start" />
                Import CSV
              </Button>
              <Button variant="outline" size="lg" render={<Link href="/contacts/companies/new" />} nativeButton={false}>
                <Building2 data-icon="inline-start" />
                Add company
              </Button>
              <Button size="lg" render={<Link href={addContactHref(params)} scroll={false} />} nativeButton={false}>
                <UserPlus data-icon="inline-start" />
                Add contact
              </Button>
            </>
          )
        }
      />
      {availability === 'setup-required' ? (
        <EmptyState icon={AlertCircle} title="Contacts are not set up yet" description="The Business Contacts database migration has not been applied to this environment." />
      ) : availability === 'error' ? (
        <EmptyState icon={AlertCircle} title="Contacts could not be loaded" description="Something went wrong while loading the directory. Refresh the page to try again." />
      ) : (
        <>
          <ContactsDirectory people={people} companies={companies} initialView={view} initialCategory={category} />
          <ContactOverlays companies={companyOptions} projects={projectOptions} person={person} />
        </>
      )}
    </PageContainer>
  )
}
