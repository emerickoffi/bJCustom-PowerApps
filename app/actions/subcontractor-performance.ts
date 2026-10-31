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
  const assignmentId = String(formData.get('project_assignment_id') ?? '')
  const submissionRaw = String(formData.get('submission_id') ?? '')
  const revisionRaw = String(formData.get('expected_revision') ?? '')
  const comments = String(formData.get('comments') ?? '').trim()

  if (!uuid.safeParse(companyId).success) return { error: 'Invalid request.' }
  const fieldErrors: Record<string, string> = {}
  if (!uuid.safeParse(assignmentId).success) fieldErrors.project_assignment_id = 'Choose the project you are rating'
  const submissionId = submissionRaw && submissionRaw !== 'none' ? submissionRaw : null
  if (submissionId && !uuid.safeParse(submissionId).success) fieldErrors.submission_id = 'Choose verified work'

  const scores: Record<string, number | null> = {}
  for (const c of PERFORMANCE_CRITERIA) {
    const optional = 'optional' in c && c.optional
    const v = parseStars(formData.get(c.key), { allowNa: optional })
    if (v === undefined) fieldErrors[c.key] = optional ? 'Choose a rating or N/A' : 'Choose 1 to 5 stars'
    else scores[c.key] = v
  }
  if (comments.length > 2000) fieldErrors.comments = 'Keep comments under 2,000 characters'
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: 'Please complete the highlighted fields.' }

  const expectedRevision = /^\d+$/.test(revisionRaw) ? Number(revisionRaw) : null

  const supabase = await createClient()
  const { error } = await supabase.rpc('save_sub_performance_review', {
    p_company: companyId,
    p_project_assignment: assignmentId,
    p_submission: submissionId,
    p_quality: scores.quality,
    p_timeliness: scores.timeliness,
    p_communication: scores.communication,
    p_professionalism: scores.professionalism,
    p_issue_resolution: scores.issue_resolution,
    p_comments: comments,
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
  return { success: expectedRevision ? 'Rating revised.' : 'Rating saved.', savedId: assignmentId }
}
