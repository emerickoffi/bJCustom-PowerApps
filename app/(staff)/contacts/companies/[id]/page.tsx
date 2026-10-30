import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, HardHat, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { formatDate, formatPhone } from '@/lib/format'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadCompanyProfile, loadPersonOptions } from '@/lib/contacts-data'
import { CATEGORY_LABELS } from '@/lib/contacts'
import { DetailList, PageContainer, PageHeader, Surface } from '@/components/shared/page-header'
import { ContactStatusBadge, ContactStatusButton } from '@/components/contacts/contact-status-button'
import { CompanyContacts } from '@/components/contacts/company-contacts'

export const metadata: Metadata = { title: 'Company' }

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()
  const [company, people] = await Promise.all([
    loadCompanyProfile(supabase, session.organizationId, { id }),
    loadPersonOptions(supabase, session.organizationId),
  ])
  if (!company) notFound()
  const linked = company.subcontractor_company_id

  return (
    <PageContainer width="narrow">
      <PageHeader
        icon={linked ? HardHat : Building2}
        title={company.company_name}
        description={company.business_categories.map((k) => CATEGORY_LABELS[k]).join(' · ') || 'Business'}
        titleAddon={<ContactStatusBadge status={company.status} />}
        backHref="/contacts?view=companies"
        backLabel="Contacts"
        actions={
          linked ? (
            <Button size="lg" render={<Link href={`/subcontractors/${linked}`} />}>
              <HardHat data-icon="inline-start" />
              Open subcontractor
            </Button>
          ) : (
            <>
              <ContactStatusButton kind="company" id={company.id} name={company.company_name} status={company.status} />
              <Button size="lg" render={<Link href={`/contacts/companies/${company.id}/edit`} />}>
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
            </>
          )
        }
      />

      {linked && (
        <p className="rounded-lg border border-[#1D5FBD]/20 bg-[#E6F0FF] px-4 py-3 text-sm text-[#1D5FBD]">
          This company is linked to a subcontractor record. Its name, email, phone, and status are managed on the Subcontractor page. You can still manage its contact persons here.
        </p>
      )}

      <Surface>
        <DetailList
          items={[
            { label: 'Email', value: company.company_email ? <a href={`mailto:${company.company_email}`} className="underline-offset-4 hover:underline">{company.company_email}</a> : '—' },
            { label: 'Phone', value: company.company_phone ? formatPhone(company.company_phone) : '—' },
            { label: 'Product categories', value: company.product_categories.join(', ') || '—' },
            { label: 'Added', value: formatDate(company.created_at) },
            { label: 'Notes', value: company.notes ? <span className="whitespace-pre-line">{company.notes}</span> : '—' },
          ]}
        />
      </Surface>

      <CompanyContacts
        target={{ companyId: company.id }}
        contacts={company.contacts}
        people={people}
        canEdit
        companyInactive={company.status === 'inactive'}
        subcontractor={Boolean(linked)}
      />
    </PageContainer>
  )
}
