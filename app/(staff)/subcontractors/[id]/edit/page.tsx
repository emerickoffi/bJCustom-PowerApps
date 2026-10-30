import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { HardHat as HardHatIcon } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadEditSubcontractorFormData } from '@/lib/subcontractor-form-data'
import { updateSubcontractorAction } from '@/app/actions/subcontractors'
import { PageHeader } from '@/components/shared/page-header'
import { SubcontractorForm } from '@/components/subcontractors/subcontractor-form'

export const metadata: Metadata = { title: 'Edit subcontractor' }

export default async function EditSubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  if (!isUuid(id)) notFound()

  const supabase = await createClient()
  const data = await loadEditSubcontractorFormData(supabase, session.organizationId, id)
  if (!data?.company) notFound()
  const { company } = data

  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        icon={HardHatIcon}
        backHref={`/subcontractors/${company.id}`}
        backLabel={company.company_name}
        title={`Edit ${company.company_name}`}
        description="Update company details, contact persons, and project assignments. Previous assignments are preserved for reference."
      />
      <SubcontractorForm
        action={updateSubcontractorAction.bind(null, company.id)}
        cancelHref={`/subcontractors/${company.id}`}
        {...data}
      />
    </div>
  )
}
