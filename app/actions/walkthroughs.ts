'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireManager, requireStaff } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { ISSUE_DESCRIPTION_MAX, STAFF_SETTABLE_ISSUE_STATUSES, WALKTHROUGH_TYPE_LABELS } from '@/lib/walkthroughs'

const uuid = z.uuid()

const walkthroughSchema = z.object({
  title: z.string().trim().min(2, 'Enter a title').max(160),
  walkthrough_type: z.enum(Object.keys(WALKTHROUGH_TYPE_LABELS) as [string, ...string[]]),
  scheduled_date: z
    .string()
    .trim()
    .transform((v) => v || null)
    .pipe(z.iso.date().nullable()),
  instructions: z.string().trim().max(2000).optional().default(''),
  items: z
    .string()
    .transform((raw, ctx) => {
      try {
        return JSON.parse(raw)
      } catch {
        ctx.addIssue({ code: 'custom', message: 'Invalid checklist' })
        return z.NEVER
      }
    })
    .pipe(
      z
        .array(z.object({ category: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(160) }))
        .min(1, 'Add at least one checklist item')
        .max(300),
    ),
})

export async function createWalkthroughAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const values = formValues(formData)
  const parsed = walkthroughSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const keys = new Set<string>()
  for (const item of parsed.data.items) {
    const key = `${item.category.toLowerCase()}|${item.label.toLowerCase()}`
    if (keys.has(key)) return { error: `"${item.label}" appears twice in ${item.category}.`, values }
    keys.add(key)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_walkthrough', {
    p_project: projectId,
    p_title: parsed.data.title,
    p_type: parsed.data.walkthrough_type,
    p_scheduled: parsed.data.scheduled_date,
    p_instructions: parsed.data.instructions,
    p_items: parsed.data.items,
  })
  if (error) return { error: friendlyDbError(error), values }

  revalidatePath(`/projects/${projectId}`)
  redirect(`/projects/${projectId}/walkthroughs/${data}`)
}

async function requireHomeowner() {
  const session = await getSession()
  if (!session || session.role !== 'client') return null
  return session
}

const responseSchema = z.object({
  itemId: uuid,
  response: z.enum(['satisfactory', 'needs_attention', 'not_applicable']).nullable(),
  description: z.string().max(ISSUE_DESCRIPTION_MAX, `Limit ${ISSUE_DESCRIPTION_MAX.toLocaleString()} characters`).nullable(),
})

export type SaveResponseResult = { savedAt?: string; error?: string }

export async function saveWalkthroughResponse(input: z.input<typeof responseSchema>): Promise<SaveResponseResult> {
  if (!(await requireHomeowner())) return { error: 'Please sign in again to keep saving.' }
  const parsed = responseSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid response.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_walkthrough_response', {
    p_item: parsed.data.itemId,
    p_response: parsed.data.response,
    p_description: parsed.data.description,
  })
  if (error) return { error: friendlyDbError(error) }
  return { savedAt: data as string }
}

export async function submitWalkthroughAction(walkthroughId: string): Promise<ActionState> {
  if (!(await requireHomeowner())) return { error: 'Please sign in again.' }
  if (!uuid.safeParse(walkthroughId).success) return { error: 'Invalid walkthrough.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_walkthrough', { p_walkthrough: walkthroughId })
  if (error) return { error: friendlyDbError(error) }

  const result = data as { already_submitted: boolean; issues_created: number }
  revalidatePath('/portal')
  revalidatePath(`/portal/walkthroughs/${walkthroughId}`)
  if (result.already_submitted) return { success: 'This walkthrough was already submitted.' }
  const count = result.issues_created
  return {
    success: count
      ? `Walkthrough submitted. ${count} item${count === 1 ? '' : 's'} sent to your builder for repair.`
      : 'Walkthrough submitted. Thank you!',
  }
}

export async function validateRepairAction(
  issueId: string,
  accepted: boolean,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await requireHomeowner())) return { error: 'Please sign in again.' }
  if (!uuid.safeParse(issueId).success) return { error: 'Invalid issue.' }
  const note = String(formData.get('note') ?? '').trim().slice(0, 2000)

  const supabase = await createClient()
  const { error } = await supabase.rpc('validate_issue_repair', { p_issue: issueId, p_accepted: accepted, p_note: note })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/portal', 'layout')
  return { success: accepted ? 'Thank you for confirming the repair.' : 'Your builder has been notified.' }
}

const issueUpdateSchema = z.object({
  status: z.enum(STAFF_SETTABLE_ISSUE_STATUSES as [string, ...string[]]),
  responsible_user_id: z
    .string()
    .transform((v) => v || null)
    .pipe(uuid.nullable()),
  corrective_action: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => v || null),
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  due_date: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date.')
    .transform((v) => v || null),
})

export async function updateIssueAction(
  projectId: string,
  issueId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff()
  if (!uuid.safeParse(issueId).success) return { error: 'Invalid issue.' }
  const parsed = issueUpdateSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_issues')
    .update(parsed.data)
    .eq('id', issueId)
    .eq('organization_id', session.organizationId)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Issue not found or you do not have access.' }

  revalidatePath(`/projects/${projectId}/issues/${issueId}`)
  revalidatePath(`/projects/${projectId}`)
  return { success: 'Issue updated.' }
}

export async function approveRepairAction(projectId: string, issueId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(issueId).success) return { error: 'Invalid issue.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_issues')
    .update({ builder_approved_at: new Date().toISOString() })
    .eq('id', issueId)
    .eq('organization_id', session.organizationId)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Issue not found or you do not have access.' }

  revalidatePath(`/projects/${projectId}/issues/${issueId}`)
  return { success: 'Repair approved and sent to the homeowner for review.' }
}

export async function addIssueNoteAction(
  projectId: string,
  issueId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff()
  if (!uuid.safeParse(issueId).success) return { error: 'Invalid issue.' }
  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { error: 'Write a note first.', fieldErrors: { body: 'Required' } }
  if (body.length > 5000) return { error: 'Notes are limited to 5,000 characters.' }
  const visibility = formData.get('visibility') === 'shared' ? 'shared' : 'internal'

  const supabase = await createClient()
  const { error } = await supabase.from('project_issue_notes').insert({
    organization_id: session.organizationId,
    issue_id: issueId,
    body,
    created_by: session.userId,
    visibility,
    author_kind: 'builder',
  })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/projects/${projectId}/issues/${issueId}`)
  if (visibility === 'shared') {
    revalidatePath('/portal', 'layout')
    return { success: 'Reply sent. The homeowner has been notified.' }
  }
  return { success: 'Note added.' }
}

export type IssueCommentResult = { noteId?: string; error?: string }

export async function addIssueCommentAction(issueId: string, body: string): Promise<IssueCommentResult> {
  const session = await requireHomeowner()
  if (!session) return { error: 'Please sign in again.' }
  if (!uuid.safeParse(issueId).success) return { error: 'Invalid issue.' }
  const text = String(body ?? '').trim()
  if (!text) return { error: 'Write a comment first.' }
  if (text.length > 5000) return { error: 'Comments are limited to 5,000 characters.' }

  const supabase = await createClient()
  const { data: issue } = await supabase.from('project_issues').select('organization_id, status').eq('id', issueId).maybeSingle()
  if (!issue) return { error: 'This issue could not be found.' }
  if (issue.status === 'closed') return { error: 'This issue is closed. Contact your builder if something still needs attention.' }

  const { data, error } = await supabase
    .from('project_issue_notes')
    .insert({
      organization_id: issue.organization_id,
      issue_id: issueId,
      body: text,
      created_by: session.userId,
      visibility: 'shared',
      author_kind: 'homeowner',
    })
    .select('id')
    .single()
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/portal', 'layout')
  return { noteId: data.id }
}

export async function markNotificationReadAction(notificationId: string): Promise<ActionState> {
  const session = await getSession()
  if (!session || !uuid.safeParse(notificationId).success) return { error: 'Invalid notification.' }
  const supabase = await createClient()
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('user_id', session.userId)
  revalidatePath('/dashboard')
  return {}
}
