import type { Metadata } from 'next'
import { Building2 } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createCompanyAction } from '@/app/actions/contacts'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { CompanyForm } from '@/components/contacts/company-form'

export const metadata: Metadata = { title: 'Add company' }

export default async function NewCompanyPage() {
  await requireManager()
  return (
    <PageContainer width="form">
      <PageHeader
        icon={Building2}
        title="Add company"
        description="Vendors, suppliers, design firms, and other businesses. Add subcontractors from the Subcontractors page."
        backHref="/contacts?view=companies"
        backLabel="Contacts"
      />
      <CompanyForm action={createCompanyAction} cancelHref="/contacts?view=companies" />
    </PageContainer>
  )
}
