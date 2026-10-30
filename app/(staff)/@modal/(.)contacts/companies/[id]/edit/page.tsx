import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadCompanyProfile } from '@/lib/contacts-data'
import { updateCompanyAction } from '@/app/actions/contacts'
import { CompanyForm } from '@/components/contacts/company-form'
import { RouteFormDrawer } from '@/components/shared/route-form-drawer'

export default async function EditCompanyDrawer({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const company = await loadCompanyProfile(await createClient(), session.organizationId, { id })
  if (!company) notFound()

  return (
    <RouteFormDrawer kind="company" title={`Edit ${company.company_name}`} description="Changes apply everywhere this company appears.">
      <CompanyForm key={company.id} action={updateCompanyAction.bind(null, company.id)} cancelHref={`/contacts/companies/${company.id}`} company={company} />
    </RouteFormDrawer>
  )
}
