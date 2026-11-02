'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { friendlyDbError, type ActionState } from '@/lib/action-state'
import { isSubWorkSetupError } from '@/lib/subcontractor-work'
import { PERFORMANCE_CRITERIA, parseStars } from '@/lib/subcontractor-performance'

const uuid = z.uuid()

export async function savePerformanceReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')

  const companyId = String(formData.get('company_id') ?? '')
  const projectId = String(formData.get('project_id') ?? '')
  const revisionRaw = String(formData.get('expected_revision') ?? '')
  const comments = String(formData.get('comments') ?? '').trim()
  const confirmed = formData.get('work_confirmed') === 'yes'

  if (!uuid.safeParse(companyId).success) return { error: 'Invalid request.' }
  const fieldErrors: Record<string, string> = {}
  if (!uuid.safeParse(projectId).success) fieldErrors.project_id = 'Choose the project you are reviewing'

  const overall = parseStars(formData.get('overall_rating'))
  if (overall == null) fieldErrors.overall_rating = 'Choose an overall rating from 1 to 5 stars'

  const scores: Record<string, number | null> = {}
  for (const c of PERFORMANCE_CRITERIA) {
    const v = parseStars(formData.get(c.key), { allowNa: true })
    if (v === undefined) fieldErrors[c.key] = 'Choose 1 to 5 stars or Not assessed'
    else scores[c.key] = v
  }
  if (!confirmed) fieldErrors.work_confirmed = 'Confirm that you assessed this company’s work on the project'
  if (comments.length > 2000) fieldErrors.comments = 'Keep comments under 2,000 characters'
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: 'Please complete the highlighted fields.' }

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('subcontractor_companies')
    .select('id')
    .eq('organization_id', session.organizationId)
    .eq('id', companyId)
    .maybeSingle()
  if (!company) return { error: 'This subcontractor could not be found.' }

  const expectedRevision = /^\d+$/.test(revisionRaw) ? Number(revisionRaw) : null
  const { error } = await supabase.rpc('save_subcontractor_rating', {
    p_company: companyId,
    p_project: projectId,
    p_overall: overall,
    p_quality: scores.quality,
    p_schedule_reliability: scores.schedule_reliability,
    p_communication: scores.communication,
    p_cleanliness: scores.cleanliness,
    p_safety: scores.safety,
    p_comments: comments,
    p_work_confirmed: confirmed,
    p_expected_revision: expectedRevision,
  })
  if (error) {
    return {
      error: isSubWorkSetupError(error)
        ? 'Performance ratings are not set up in this environment yet. Ask an administrator to apply the pending migration.'
        : friendlyDbError(error),
    }
  }
  revalidatePath('/subcontractors')
  revalidatePath(`/subcontractors/${companyId}`)
  return { success: expectedRevision ? 'Review updated.' : 'Review saved.', savedId: projectId }
}
