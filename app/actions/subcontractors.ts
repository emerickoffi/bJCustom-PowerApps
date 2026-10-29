'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { isMissingTableError, subcontractorSchema } from '@/lib/subcontractors'

export async function createSubcontractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.', values }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { error: 'Your account is not associated with an active construction company.', values }
  }
  if (!canManage(session.role)) return { error: 'Your role does not allow you to add subcontractors.', values }

  const features = await getOrgFeatures(session.organizationId)
  if (!features.subcontractors) return { error: 'Subcontractor management is not turned on for your company.', values }

  const parsed = subcontractorSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { error } = await supabase
    .from('subcontractor_companies')
    .insert({ ...parsed.data, organization_id: session.organizationId })
  if (error) {
    if (error.code === '23505') {
      return {
        error: 'Please correct the highlighted fields.',
        fieldErrors: { company_name: 'A subcontractor with this company name already exists' },
        values,
      }
    }
    if (isMissingTableError(error)) {
      return { error: 'Subcontractor storage is not set up yet. Ask an administrator to apply the database migration.', values }
    }
    return { error: friendlyDbError(error), values }
  }

  revalidatePath('/subcontractors')
  redirect(`/subcontractors?added=${encodeURIComponent(parsed.data.company_name)}`)
}
