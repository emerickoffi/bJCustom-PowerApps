'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireStaff } from '@/lib/session'
import { friendlyDbError, type ActionState } from '@/lib/action-state'
import { FEATURES, type FeatureKey } from '@/lib/feature-registry'
import { getAssistantProviderConfig } from '@/lib/ai/assistant-provider'

const featureKeys = FEATURES.filter((f) => f.available && !f.core).map((f) => f.key) as [FeatureKey, ...FeatureKey[]]

export async function setFeatureAction(key: string, enabled: boolean): Promise<ActionState> {
  const session = await requireAdmin()
  const parsed = z.enum(featureKeys).safeParse(key)
  if (!parsed.success) return { error: 'This feature cannot be changed yet.' }
  if (enabled && parsed.data === 'ai_assistant' && !getAssistantProviderConfig().configured) {
    return { error: 'Connect an AI provider before turning on the B & J AI Assistant.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_features')
    .upsert({ organization_id: session.organizationId, feature_key: parsed.data, enabled }, { onConflict: 'organization_id,feature_key' })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/', 'layout')
  return { success: `${FEATURES.find((f) => f.key === parsed.data)?.label} ${enabled ? 'turned on' : 'turned off'}.` }
}

const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
const reason = z.string().trim().min(10, 'Explain the reason in at least 10 characters').max(2000)

export async function openNotificationAction(notificationId: string): Promise<ActionState> {
  const session = await requireStaff()
  if (!uuid.safeParse(notificationId).success) return { error: 'Invalid notification.' }
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data: row } = await supabase
    .from('notifications')
    .select('action_required, acknowledged_at')
    .eq('id', notificationId)
    .eq('user_id', session.userId)
    .maybeSingle()
  if (!row) return { error: 'Notification not found.' }
  const { error } = await supabase
    .from('notifications')
    .update(row.action_required && !row.acknowledged_at ? { read_at: now, acknowledged_at: now } : { read_at: now })
    .eq('id', notificationId)
    .eq('user_id', session.userId)
  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/', 'layout')
  return { success: 'Notification acknowledged.' }
}

export async function enrollWarrantyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const projectId = uuid.safeParse(formData.get('project_id'))
  if (!projectId.success) return { error: 'Project not found.' }
  const date = formData.get('completion_date')
  let p_completion_date: string | null = null
  let p_reason: string | null = null
  if (date) {
    const d = isoDate.safeParse(date)
    const r = reason.safeParse(formData.get('reason') ?? '')
    if (!d.success) return { fieldErrors: { completion_date: d.error.issues[0].message } }
    if (!r.success) return { fieldErrors: { reason: r.error.issues[0].message } }
    p_completion_date = d.data
    p_reason = r.data
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('enroll_project_warranty', { p_project: projectId.data, p_completion_date, p_reason })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath(`/projects/${projectId.data}/warranty`)
  revalidatePath('/warranty')
  return { success: 'Warranty started.' }
}

export async function correctCompletionDateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const projectId = uuid.safeParse(formData.get('project_id'))
  const d = isoDate.safeParse(formData.get('completion_date'))
  const r = reason.safeParse(formData.get('reason') ?? '')
  if (!projectId.success) return { error: 'Project not found.' }
  if (!d.success) return { fieldErrors: { completion_date: d.error.issues[0].message } }
  if (!r.success) return { fieldErrors: { reason: r.error.issues[0].message } }
  const supabase = await createClient()
  const { error } = await supabase.rpc('correct_project_completion_date', {
    p_project: projectId.data,
    p_new_date: d.data,
    p_reason: r.data,
  })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath(`/projects/${projectId.data}/warranty`)
  revalidatePath('/warranty')
  return { success: 'Completion date corrected and milestones recalculated.' }
}

export async function archiveWarrantyAction(warrantyId: string, projectId: string, reopen: boolean): Promise<ActionState> {
  await requireAdmin()
  if (!uuid.safeParse(warrantyId).success) return { error: 'Warranty not found.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('archive_project_warranty', { p_warranty: warrantyId, p_reopen: reopen })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath(`/projects/${projectId}/warranty`)
  revalidatePath('/warranty')
  return { success: reopen ? 'Warranty reopened.' : 'Project archived.' }
}

export async function runWarrantyProcessingAction(): Promise<ActionState> {
  const session = await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('process_warranty_schedule', { p_org: session.organizationId })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/warranty')
  const reached = (data as { milestones_reached?: number } | null)?.milestones_reached ?? 0
  return { success: reached ? `${reached} milestone${reached === 1 ? '' : 's'} reached.` : 'Checked. Nothing new is due.' }
}

const followupSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('todo'), notes: z.string().max(2000).optional() }),
  z.object({ status: z.literal('prepared'), notes: z.string().max(2000).optional() }),
  z.object({
    status: z.literal('sent'),
    sent_on: isoDate,
    delivery_method: z.enum(['mail', 'hand_delivered', 'email', 'other']),
    notes: z.string().max(2000).optional(),
  }),
])

export async function updateFollowupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff()
  const id = uuid.safeParse(formData.get('task_id'))
  const projectId = uuid.safeParse(formData.get('project_id'))
  if (!id.success || !projectId.success) return { error: 'Follow-up not found.' }
  const parsed = followupSchema.safeParse({
    status: formData.get('status'),
    sent_on: formData.get('sent_on') || undefined,
    delivery_method: formData.get('delivery_method') || undefined,
    notes: (formData.get('notes') as string) || undefined,
  })
  if (!parsed.success) return { error: 'Enter the date sent and how it was delivered.' }
  const update =
    parsed.data.status === 'sent'
      ? { status: 'sent', sent_on: parsed.data.sent_on, delivery_method: parsed.data.delivery_method, notes: parsed.data.notes ?? null }
      : { status: parsed.data.status, sent_on: null, delivery_method: null, notes: parsed.data.notes ?? null }
  const supabase = await createClient()
  const { error } = await supabase.from('warranty_followup_tasks').update(update).eq('id', id.data)
  if (error) return { error: friendlyDbError(error) }
  revalidatePath(`/projects/${projectId.data}/warranty`)
  revalidatePath('/warranty')
  return { success: 'Follow-up updated.' }
}
