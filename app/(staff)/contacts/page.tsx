import type { Metadata } from 'next'
import { AlertCircle, BookUser } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { loadAssignableProjectOptions, loadCompanyOptions, loadDirectory, loadPersonProfile } from '@/lib/contacts-data'
import { CATEGORY_KEYS, parseView, type CategoryKey, type DirectoryView } from '@/lib/contacts'
import { isUuid } from '@/lib/subcontractor-projects'
import { EmptyState, HeaderHelp, PageContainer, PageHeader } from '@/components/shared/page-header'
import { ContactsDirectory } from '@/components/contacts/contacts-directory'
import { ContactsPrimaryAction } from '@/components/contacts/contacts-primary-action'
import { ContactOverlays } from '@/components/contacts/contact-overlays'

export const metadata: Metadata = { title: 'Contacts' }

function countLabel(value: number, noun: string, plural: string) {
  return `${value.toLocaleString()} ${value === 1 ? noun : plural}`
}

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; category?: string; new?: string; contact?: string; edit?: string }>
}) {
  const session = await requireManager()
  const params = await searchParams
  const view: DirectoryView = parseView(typeof params.view === 'string' ? params.view : undefined)
  const category = CATEGORY_KEYS.includes(params.category as CategoryKey) ? (params.category as CategoryKey) : null
  const personId = [params.edit, params.contact].find((id) => id && isUuid(id)) ?? null
  const needsOptions = params.new === 'contact' || Boolean(params.edit && personId)

  const supabase = await createClient()
  const [{ availability, people, companies }, companyOptions, projectOptions, person] = await Promise.all([
    loadDirectory(supabase, session.organizationId),
    needsOptions || params.new === 'company' ? loadCompanyOptions(supabase, session.organizationId) : Promise.resolve([]),
    needsOptions ? loadAssignableProjectOptions(supabase, session.organizationId) : Promise.resolve([]),
    personId ? loadPersonProfile(supabase, session.organizationId, personId) : Promise.resolve(null),
  ])
  const inactivePeople = people.filter((p) => p.status === 'inactive').length
  const inactiveCompanies = companies.filter((c) => c.status === 'inactive').length

  return (
    <PageContainer className="gap-5 md:gap-6">
      <PageHeader
        icon={BookUser}
        title="Contacts"
        titleAddon={
          availability === 'ready' ? (
            <div className="relative flex min-w-0 items-center gap-0.5">
              <p className="text-sm tabular-nums text-muted-foreground">
                {`${countLabel(people.length, 'person', 'people')} · ${countLabel(companies.length, 'company', 'companies')} in directory`}
              </p>
              <HeaderHelp label="About directory totals" className="static">
                <p>
                  {inactivePeople + inactiveCompanies > 0
                    ? `Directory totals count every record, including ${countLabel(inactivePeople, 'inactive person', 'inactive people')} and ${countLabel(inactiveCompanies, 'inactive company', 'inactive companies')}.`
                    : 'Directory totals count every record, active or inactive.'}
                </p>
                <p className="mt-2">The list starts on Active records only, so its counts follow the filters applied below.</p>
              </HeaderHelp>
            </div>
          ) : undefined
        }
        actions={availability === 'ready' && <ContactsPrimaryAction />}
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
