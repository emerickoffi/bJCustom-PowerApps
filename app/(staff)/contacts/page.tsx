import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AlertCircle, BookUser } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadAssignableProjectOptions, loadCompanyOptions, loadCompanyProfile, loadDirectory, loadPersonProfile } from '@/lib/contacts-data'
import { CATEGORY_KEYS, parseView, type CategoryKey, type DirectoryView } from '@/lib/contacts'
import { CONTACT_PREVIEW_PARAM } from '@/lib/record-preview'
import { isUuid } from '@/lib/subcontractor-projects'
import { EmptyState, PageContainer, PageHeader } from '@/components/shared/page-header'
import { ContactsDirectory } from '@/components/contacts/contacts-directory'
import { ContactsCreateAction } from '@/components/contacts/contacts-primary-action'
import { ContactOverlays } from '@/components/contacts/contact-overlays'

export const metadata: Metadata = { title: 'Contacts' }

type ContactsSearchParams = { view?: string; category?: string; new?: string; contact?: string; edit?: string; editCompany?: string }

/** Links to the retired contact details drawer open the same person in the list preview instead. */
function legacyContactHref(params: ContactsSearchParams) {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && !['contact', 'back', 'view'].includes(key)) next.set(key, value)
  }
  if (params.contact && isUuid(params.contact)) next.set(CONTACT_PREVIEW_PARAM, params.contact)
  const qs = next.toString()
  return qs ? `/contacts?${qs}` : '/contacts'
}

export default async function ContactsPage({ searchParams }: { searchParams: Promise<ContactsSearchParams> }) {
  const session = await requireManager()
  const params = await searchParams
  if (params.contact !== undefined) redirect(legacyContactHref(params))

  const view: DirectoryView = parseView(typeof params.view === 'string' ? params.view : undefined)
  const category = CATEGORY_KEYS.includes(params.category as CategoryKey) ? (params.category as CategoryKey) : null
  const personId = params.edit && isUuid(params.edit) ? params.edit : null
  const companyId = params.editCompany && isUuid(params.editCompany) ? params.editCompany : null
  const needsOptions = params.new === 'contact' || Boolean(personId)

  const supabase = await createClient()
  const [{ availability, people, companies }, companyOptions, projectOptions, person, company] = await Promise.all([
    loadDirectory(supabase, session.organizationId),
    needsOptions || params.new === 'company' ? loadCompanyOptions(supabase, session.organizationId) : Promise.resolve([]),
    needsOptions ? loadAssignableProjectOptions(supabase, session.organizationId) : Promise.resolve([]),
    personId ? loadPersonProfile(supabase, session.organizationId, personId) : Promise.resolve(null),
    companyId ? loadCompanyProfile(supabase, session.organizationId, { id: companyId }) : Promise.resolve(null),
  ])
  const formOpen = params.new === 'contact' || params.new === 'company' || Boolean(person) || Boolean(company)

  return (
    <PageContainer className="gap-4">
      {/* The ready directory renders its own header, since its count and action follow the active tab. */}
      {availability !== 'ready' && <PageHeader icon={BookUser} title="Contacts" />}
      {availability === 'setup-required' ? (
        <EmptyState icon={AlertCircle} title="Contacts are not set up yet" description="The Business Contacts database migration has not been applied to this environment." />
      ) : availability === 'error' ? (
        <EmptyState icon={AlertCircle} title="Contacts could not be loaded" description="Something went wrong while loading the directory. Refresh the page to try again." />
      ) : (
        <>
          <ContactsDirectory people={people} companies={companies} initialView={view} initialCategory={category} formOpen={formOpen} />
          <ContactOverlays companies={companyOptions} projects={projectOptions} person={person} company={company} />
          <ContactsCreateAction />
        </>
      )}
    </PageContainer>
  )
}
