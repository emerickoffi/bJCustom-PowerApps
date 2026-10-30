import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadCompanyProfile } from '@/lib/contacts-data'
import { updateCompanyAction } from '@/app/actions/contacts'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { CompanyForm } from '@/components/contacts/company-form'

export const metadata: Metadata = { title: 'Edit company' }

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const company = await loadCompanyProfile(await createClient(), session.organizationId, { id })
  if (!company) notFound()
  const href = `/contacts/companies/${company.id}`
  return (
    <PageContainer width="form">
      <PageHeader icon={Pencil} title={`Edit ${company.company_name}`} backHref={href} backLabel="Company" />
      <CompanyForm action={updateCompanyAction.bind(null, company.id)} cancelHref={href} company={company} />
    </PageContainer>
  )
}
