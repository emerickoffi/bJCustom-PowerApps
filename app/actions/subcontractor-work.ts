'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { friendlyDbError, type ActionState } from '@/lib/action-state'
import { SUB_WORK_BUCKET, isSubWorkSetupError, type SubmissionKind } from '@/lib/subcontractor-work'
import type { MediaMeta } from '@/components/walkthroughs/media-uploader'

const uuid = z.uuid()
const SETUP_MESSAGE = 'Subcontractor work submission is not set up in this environment yet. Ask an administrator to apply the pending migration.'

function dbError(error: { code?: string; message?: string }) {
  return isSubWorkSetupError(error) ? SETUP_MESSAGE : friendlyDbError(error)
}

function revalidateSub(kind: SubmissionKind, targetId: string) {
  revalidatePath('/sub')
  revalidatePath(kind === 'work' ? `/sub/work/${targetId}` : `/sub/corrections/${targetId}`)
}

export async function startSubmissionAction(kind: SubmissionKind, targetId: string): Promise<{ id?: string; error?: string }> {
  await requireSubcontractor()
  if (!['work', 'correction'].includes(kind) || !uuid.safeParse(targetId).success) return { error: 'Invalid request.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sub_start_submission', { p_kind: kind, p_target: targetId })
  if (error) return { error: dbError(error) }
  revalidateSub(kind, targetId)
  return { id: data as string }
}

const metaSchema = z.object({
  storage_path: z.string().min(1).max(500),
  file_name: z.string().min(1).max(200),
  mime_type: z.string().regex(/^(image|video)\//),
  size_bytes: z.number().int().positive(),
})

export async function registerSubEvidenceAction(
  submissionId: string,
  role: 'completion' | 'inspection',
  meta: MediaMeta,
): Promise<{ id?: string; error?: string }> {
  if (role === 'inspection') await requireManager()
  else await requireSubcontractor()
  const parsed = metaSchema.safeParse(meta)
  if (!uuid.safeParse(submissionId).success || !parsed.success) return { error: 'Invalid upload.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('add_sub_submission_attachment', {
    p_submission: submissionId,
    p_role: role,
    p_path: parsed.data.storage_path,
    p_file_name: parsed.data.file_name,
    p_mime: parsed.data.mime_type,
    p_size: parsed.data.size_bytes,
  })
  if (error) return { error: dbError(error) }
  return { id: data as string }
}

export async function removeSubEvidenceAction(attachmentId: string): Promise<string | null> {
  await requireSubcontractor()
  if (!uuid.safeParse(attachmentId).success) return 'Invalid photo.'
  const supabase = await createClient()
  const { data: path, error } = await supabase.rpc('remove_sub_submission_attachment', { p_attachment: attachmentId })
  if (error) return dbError(error)
  if (typeof path === 'string') await supabase.storage.from(SUB_WORK_BUCKET).remove([path])
  return null
}

const submitSchema = z.object({
  submission_id: uuid,
  kind: z.enum(['work', 'correction']),
  target_id: uuid,
  notes: z.string().trim().max(5000, 'Keep notes under 5,000 characters').optional(),
  completed_on: z.iso.date('Enter the date the work was finished').optional().or(z.literal('')),
})

export async function submitSubWorkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSubcontractor()
  const parsed = submitSchema.safeParse({
    submission_id: formData.get('submission_id'),
    kind: formData.get('kind'),
    target_id: formData.get('target_id'),
    notes: formData.get('notes') ?? undefined,
    completed_on: formData.get('completed_on') ?? '',
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? 'Please check the form.' }
  }
  const { submission_id, kind, target_id, notes, completed_on } = parsed.data
  if (kind === 'work' && !completed_on) return { fieldErrors: { completed_on: 'Enter the date the work was finished' } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('sub_submit_work', {
    p_submission: submission_id,
    p_notes: notes ?? '',
    p_completed_on: completed_on || null,
  })
  if (error) return { error: dbError(error) }
  revalidateSub(kind, target_id)
  return { success: 'Submitted for builder inspection.' }
}

const reviewSchema = z.object({
  submission_id: uuid,
  project_id: uuid,
  decision: z.enum(['accepted', 'correction_required', 'returned'], 'Choose a decision'),
  notes: z.string().trim().max(5000, 'Keep notes under 5,000 characters'),
  issue_ids: z.array(uuid).max(50),
})

export async function reviewSubSubmissionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager()
  const parsed = reviewSchema.safeParse({
    submission_id: formData.get('submission_id'),
    project_id: formData.get('project_id'),
    decision: formData.get('decision'),
    notes: String(formData.get('notes') ?? ''),
    issue_ids: formData.getAll('issue_ids').map(String),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Please check the form.' }
  const { submission_id, project_id, decision, notes, issue_ids } = parsed.data
  if (decision !== 'accepted' && !notes) return { fieldErrors: { notes: 'Describe what needs to be corrected' } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('review_sub_submission', {
    p_submission: submission_id,
    p_decision: decision,
    p_notes: notes,
    p_issue_ids: decision === 'correction_required' ? issue_ids : [],
  })
  if (error) return { error: dbError(error) }
  revalidatePath(`/projects/${project_id}/subcontractor-work`)
  revalidatePath(`/projects/${project_id}/subcontractor-work/${submission_id}`)
  revalidatePath(`/projects/${project_id}/issues`, 'layout')
  return { success: 'Verification recorded.' }
}

export async function assignIssueSubcontractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  const issueId = String(formData.get('issue_id') ?? '')
  const projectId = String(formData.get('project_id') ?? '')
  const raw = String(formData.get('company_id') ?? '')
  const companyId = raw === 'none' || raw === '' ? null : raw
  if (!uuid.safeParse(issueId).success || !uuid.safeParse(projectId).success) return { error: 'Invalid request.' }
  if (companyId && !uuid.safeParse(companyId).success) return { error: 'Choose a subcontractor.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_issues')
    .update({ responsible_subcontractor_company_id: companyId })
    .eq('id', issueId)
    .eq('project_id', projectId)
    .eq('organization_id', session.organizationId)
    .select('id')
  if (error) return { error: dbError(error) }
  if (!data?.length) return { error: 'This issue could not be updated.' }
  revalidatePath(`/projects/${projectId}/issues/${issueId}`)
  return { success: companyId ? 'Subcontractor assigned and notified.' : 'Subcontractor removed.' }
}
