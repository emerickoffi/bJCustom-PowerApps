import { notFound } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { loadEditSubcontractorFormData } from '@/lib/subcontractor-form-data'
import { SubcontractorFormDrawer } from '@/components/subcontractors/subcontractor-form-drawer'

export default async function EditSubcontractorDrawer({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createClient()
  const data = await loadEditSubcontractorFormData(supabase, session.organizationId, id)
  if (!data?.company) notFound()
  return <SubcontractorFormDrawer key={id} data={data} />
}
