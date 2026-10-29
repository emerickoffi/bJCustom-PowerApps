import type { Metadata } from 'next'
import { HardHat as HardHatIcon } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createSubcontractorAction } from '@/app/actions/subcontractors'
import { PageHeader } from '@/components/shared/page-header'
import { SubcontractorForm } from '@/components/subcontractors/subcontractor-form'

export const metadata: Metadata = { title: 'Add subcontractor' }

export default async function NewSubcontractorPage() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  return (
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        icon={HardHatIcon}
        backHref="/subcontractors"
        backLabel="Subcontractors"
        title="Add subcontractor"
        description="Save a trade partner to your company directory. Only administrators and project managers can see it."
      />
      <SubcontractorForm action={createSubcontractorAction} cancelHref="/subcontractors" />
    </div>
  )
}
