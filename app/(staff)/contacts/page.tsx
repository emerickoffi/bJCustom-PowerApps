import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertCircle, BookUser, Building2, FileUp, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadDirectory } from '@/lib/contacts-data'
import { CATEGORY_KEYS, DIRECTORY_VIEWS, type CategoryKey, type DirectoryView } from '@/lib/contacts'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared/page-header'
import { ContactsDirectory } from '@/components/contacts/contacts-directory'

export const metadata: Metadata = { title: 'Contacts' }

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ view?: string; category?: string }> }) {
  const session = await requireManager()
  const params = await searchParams
  const view: DirectoryView = DIRECTORY_VIEWS.some((v) => v.value === params.view) ? (params.view as DirectoryView) : 'all'
  const category = CATEGORY_KEYS.includes(params.category as CategoryKey) ? (params.category as CategoryKey) : null

  const supabase = await createClient()
  const { availability, people, companies } = await loadDirectory(supabase, session.organizationId)

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
              <Button size="lg" render={<Link href="/contacts/people/new" />} nativeButton={false}>
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
        <ContactsDirectory people={people} companies={companies} initialView={view} initialCategory={category} />
      )}
    </PageContainer>
  )
}
