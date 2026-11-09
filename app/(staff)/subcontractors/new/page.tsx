import type { Metadata } from 'next'
import { HardHat as HardHatIcon } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { loadNewSubcontractorFormData } from '@/lib/subcontractor-form-data'
import { createSubcontractorAction } from '@/app/actions/subcontractors'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { SubcontractorForm } from '@/components/subcontractors/subcontractor-form'

export const metadata: Metadata = { title: 'Add subcontractor' }

export default async function NewSubcontractorPage() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')

  const supabase = await createClient()
  const data = await loadNewSubcontractorFormData(supabase, session.organizationId)

  return (
    <div className={pageLayout('form')}>
      <PageHeader
        icon={HardHatIcon}
        backHref="/subcontractors"
        backLabel="Subcontractors"
        title="Add subcontractor"
      />
      <SubcontractorForm action={createSubcontractorAction} cancelHref="/subcontractors" {...data} />
    </div>
  )
}
