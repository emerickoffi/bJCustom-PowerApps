'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager, requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { parseSignedDollarsToCents } from '@/lib/financials'
import { changeOrderPath, changeOrdersPath } from '@/lib/change-orders'

const uuid = z.uuid()

function dbMessage(error: { message?: string; code?: string }) {
  if (['42501', '40001', '22023'].includes(error.code ?? '') && error.message) return error.message
  if (error.message?.includes('Enter the price before sending')) return error.message
  return friendlyDbError(error)
}

function revalidateIssue(projectId: string, issueId: string) {
  revalidatePath(`/projects/${projectId}/issues/${issueId}`)
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === '' ? null : v))

const draftSchema = z.object({
  project_id: uuid,
  issue_id: uuid,
  request_id: uuid,
  title: z.string().trim().min(2, 'Enter a title').max(160),
  description: optionalText(4000),
  reason: optionalText(2000),
  requested_by: optionalText(160),
  schedule_impact_days: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^-?\d{1,4}$/.test(v) && Number(v) >= -365 && Number(v) <= 3650), 'Enter whole days between -365 and 3650')
    .transform((v) => (v === '' ? null : Number(v))),
  // Blank means "price pending", never $0.
  price_adjustment: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null
      const cents = parseSignedDollarsToCents(v)
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter a dollar amount; use a minus sign for credits' })
        return z.NEVER
      }
      return cents
    }),
})

export async function createChangeOrderFromIssueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const parsed = draftSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const d = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_change_order_from_issue', {
    p_issue: d.issue_id,
    p_request: d.request_id,
    p_title: d.title,
    p_description: d.description,
    p_reason: d.reason,
    p_requested_by: d.requested_by,
    p_price_cents: d.price_adjustment,
    p_schedule_days: d.schedule_impact_days,
  })
  if (error) return { error: dbMessage(error), values }

  const result = data as { change_order_id: string; replayed: boolean }
  revalidateIssue(d.project_id, d.issue_id)
  revalidatePath(changeOrdersPath(d.project_id))
  redirect(changeOrderPath(d.project_id, result.change_order_id))
}

type LinkResult = { ok: true; message: string } | { ok: false; error: string }

const linkSchema = z.object({ projectId: uuid, issueId: uuid, recordId: uuid })

async function runLink(
  rpc: string,
  args: Record<string, string>,
  ids: z.infer<typeof linkSchema>,
  messages: { done: string; noop: string },
): Promise<LinkResult> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc(rpc, args)
  if (error) return { ok: false, error: dbMessage(error) }
  revalidateIssue(ids.projectId, ids.issueId)
  return { ok: true, message: data ? messages.done : messages.noop }
}

export async function linkChangeOrderAction(projectId: string, issueId: string, changeOrderId: string): Promise<LinkResult> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const ids = linkSchema.safeParse({ projectId, issueId, recordId: changeOrderId })
  if (!ids.success) return { ok: false, error: 'Choose a change order.' }
  const result = await runLink('link_issue_change_order', { p_issue: issueId, p_change_order: changeOrderId }, ids.data, {
    done: 'Change order linked.',
    noop: 'That change order is already linked.',
  })
  if (result.ok) revalidatePath(changeOrderPath(projectId, changeOrderId))
  return result
}

export async function unlinkChangeOrderAction(projectId: string, issueId: string, changeOrderId: string): Promise<LinkResult> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const ids = linkSchema.safeParse({ projectId, issueId, recordId: changeOrderId })
  if (!ids.success) return { ok: false, error: 'Choose a change order.' }
  const result = await runLink('unlink_issue_change_order', { p_issue: issueId, p_change_order: changeOrderId }, ids.data, {
    done: 'Change order unlinked. Both records are kept.',
    noop: 'That change order was already unlinked.',
  })
  if (result.ok) revalidatePath(changeOrderPath(projectId, changeOrderId))
  return result
}

export async function linkActivityAction(projectId: string, issueId: string, activityId: string): Promise<LinkResult> {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'schedule')
  const ids = linkSchema.safeParse({ projectId, issueId, recordId: activityId })
  if (!ids.success) return { ok: false, error: 'Choose a schedule activity.' }
  const result = await runLink('link_issue_schedule_activity', { p_issue: issueId, p_activity: activityId }, ids.data, {
    done: 'Schedule activity linked. Dates were not changed.',
    noop: 'That activity is already linked.',
  })
  if (result.ok) revalidatePath(`/projects/${projectId}/schedule`)
  return result
}

export async function unlinkActivityAction(projectId: string, issueId: string, activityId: string): Promise<LinkResult> {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'schedule')
  const ids = linkSchema.safeParse({ projectId, issueId, recordId: activityId })
  if (!ids.success) return { ok: false, error: 'Choose a schedule activity.' }
  const result = await runLink('unlink_issue_schedule_activity', { p_issue: issueId, p_activity: activityId }, ids.data, {
    done: 'Schedule activity unlinked.',
    noop: 'That activity was already unlinked.',
  })
  if (result.ok) revalidatePath(`/projects/${projectId}/schedule`)
  return result
}

const reviewSchema = z.object({
  project_id: uuid,
  issue_id: uuid,
  reviewer_id: z.string().uuid('Choose who should review'),
  question: z.string().trim().min(2, 'Ask a short question').max(1000, 'Keep the question under 1,000 characters'),
})

export async function requestReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  await requireStaff()
  const parsed = reviewSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const supabase = await createClient()
  const { error } = await supabase.rpc('request_issue_review', {
    p_issue: parsed.data.issue_id,
    p_reviewer: parsed.data.reviewer_id,
    p_question: parsed.data.question,
  })
  if (error) return { error: dbMessage(error), values }
  revalidateIssue(parsed.data.project_id, parsed.data.issue_id)
  return { success: 'Review requested. They have been notified.' }
}

const responseSchema = z.object({
  project_id: uuid,
  issue_id: uuid,
  request_id: uuid,
  response: z.string().trim().min(1, 'Enter a response').max(2000, 'Keep the response under 2,000 characters'),
})

export async function respondReviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  await requireStaff()
  const parsed = responseSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const supabase = await createClient()
  const { error } = await supabase.rpc('respond_issue_review', {
    p_request_event: parsed.data.request_id,
    p_response: parsed.data.response,
  })
  if (error) return { error: dbMessage(error), values }
  revalidateIssue(parsed.data.project_id, parsed.data.issue_id)
  return { success: 'Response sent.' }
}

export async function confirmChangeOrderPriceAction(projectId: string, changeOrderId: string): Promise<LinkResult> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  if (!uuid.safeParse(changeOrderId).success) return { ok: false, error: 'Change order not found.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_change_order_price', { p_id: changeOrderId })
  if (error) return { ok: false, error: error.message?.includes('already priced') ? error.message : friendlyDbError(error) }
  revalidatePath(changeOrderPath(projectId, changeOrderId))
  revalidatePath(changeOrdersPath(projectId))
  return { ok: true, message: 'Price confirmed.' }
}
