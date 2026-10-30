import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { loadNewSubcontractorFormData } from '@/lib/subcontractor-form-data'
import { SubcontractorFormDrawer } from '@/components/subcontractors/subcontractor-form-drawer'

export default async function NewSubcontractorDrawer() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const supabase = await createClient()
  const data = await loadNewSubcontractorFormData(supabase, session.organizationId)
  return <SubcontractorFormDrawer data={data} />
}
