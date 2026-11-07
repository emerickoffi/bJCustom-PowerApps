'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireStaff } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { ISSUE_DESCRIPTION_MAX } from '@/lib/walkthroughs'

const uuid = z.string().uuid()
const optionalUuid = z.union([uuid, z.literal('')]).optional().transform((v) => v || null)

const reportSchema = z.object({
  request_id: uuid,
  project_id: uuid,
  title: z.string().trim().min(2, 'Enter a short title').max(160, 'Keep the title under 160 characters'),
  description: z.string().trim().min(1, 'Describe the issue').max(ISSUE_DESCRIPTION_MAX, 'Descriptions are limited to 5,000 characters'),
  category: z.string().trim().max(80, 'Categories are limited to 80 characters').optional().default(''),
  location: z.string().trim().max(120, 'Locations are limited to 120 characters').optional().default(''),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  due_date: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'), z.literal('')])
    .optional()
    .transform((v) => v || null),
  responsible_user_id: optionalUuid,
  source_daily_log_id: optionalUuid,
  source_walkthrough_id: optionalUuid,
})

function dbMessage(error: { message?: string; code?: string }) {
  if ((error.code === '42501' || error.code === '40001') && error.message) return error.message
  return friendlyDbError(error)
}

function revalidateIssueViews(projectId: string, issueId?: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/my-work')
  revalidatePath('/dashboard')
  if (issueId) revalidatePath(`/projects/${projectId}/issues/${issueId}`)
}

export async function reportFieldIssueAction(formData: FormData): Promise<ActionState> {
  await requireStaff()
  const parsed = reportSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  const v = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('report_field_issue', {
    p_request_id: v.request_id,
    p_project: v.project_id,
    p_title: v.title,
    p_description: v.description,
    p_category: v.category,
    p_location: v.location,
    p_priority: v.priority,
    p_due_date: v.due_date,
    p_responsible: v.responsible_user_id,
    p_source_daily_log: v.source_daily_log_id,
    p_source_walkthrough: v.source_walkthrough_id,
  })
  if (error) {
    if (error.code === 'PGRST202') return { error: 'Issue reporting is not set up on the server yet. Ask an administrator to apply the latest database update.' }
    return { error: dbMessage(error) }
  }
  const result = data as { id: string; replayed: boolean }

  revalidateIssueViews(v.project_id, result.id)
  if (v.source_daily_log_id) revalidatePath(`/projects/${v.project_id}/daily-logs/${v.source_daily_log_id}`)
  if (v.source_walkthrough_id) revalidatePath(`/projects/${v.project_id}/walkthroughs/${v.source_walkthrough_id}`)
  return { savedId: result.id, success: result.replayed ? 'This issue was already reported.' : 'Issue reported.' }
}

export async function reviewFieldIssueAction(
  projectId: string,
  issueId: string,
  decision: 'close' | 'return',
  reason: string,
  expectedUpdatedAt: string | null,
): Promise<ActionState> {
  await requireStaff()
  if (!uuid.safeParse(issueId).success || !uuid.safeParse(projectId).success) return { error: 'Invalid issue.' }
  if (decision !== 'close' && decision !== 'return') return { error: 'Choose Close issue or Return for more work.' }
  const trimmed = reason.trim()
  if (decision === 'return' && !trimmed) return { error: 'Give a reason for returning the issue.', fieldErrors: { reason: 'Required' } }
  if (trimmed.length > 2000) return { error: 'Reasons are limited to 2,000 characters.', fieldErrors: { reason: 'Too long' } }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('review_field_issue', {
    p_issue: issueId,
    p_decision: decision,
    p_reason: trimmed || null,
    p_expected_updated_at: expectedUpdatedAt,
  })
  if (error) {
    if (error.code === '40001') return { error: dbMessage(error), conflict: true }
    return { error: dbMessage(error) }
  }
  const result = data as { status: string; replayed: boolean }

  revalidateIssueViews(projectId, issueId)
  if (decision === 'close') return { success: result.replayed ? 'This issue was already closed.' : 'Issue verified and closed.' }
  return { success: 'Returned for more work. The previous resolution is kept in the history.' }
}
