'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager, requireStaff, canManage } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { ACTIVITY_STATUSES, ACTIVITY_TYPES, OPTIONAL_ACTIVITIES } from '@/lib/schedule'

const uuid = z.uuid()
const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null)
  .pipe(z.iso.date().nullable())
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const progressSchema = z.object({
  status: z.enum(ACTIVITY_STATUSES),
  percent_complete: z.coerce.number().min(0, 'Use 0–100').max(100, 'Use 0–100'),
  actual_start: optionalDate,
  actual_end: optionalDate,
  delay_reason: optionalText(2000),
  public_note: optionalText(1000),
  internal_notes: optionalText(5000),
  assigned_to: z
    .string()
    .optional()
    .transform((v) => v || null)
    .pipe(uuid.nullable()),
})

const planSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(160),
  phase: z.string().trim().min(1, 'Enter a phase').max(80),
  activity_type: z.enum(ACTIVITY_TYPES),
  planned_start: optionalDate,
  planned_end: optionalDate,
  weight: z.coerce.number().min(0, 'Weight cannot be negative').max(1000),
  sort_order: z.coerce.number().int().min(0).max(100000),
  is_published: z
    .string()
    .optional()
    .transform((v) => v === 'on'),
})

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/schedule`)
  revalidatePath('/dashboard')
  revalidatePath('/portal')
}

function checkDates(data: {
  planned_start?: string | null
  planned_end?: string | null
  actual_start?: string | null
  actual_end?: string | null
}): Record<string, string> | null {
  if (data.planned_start && data.planned_end && data.planned_end < data.planned_start)
    return { planned_end: 'Planned finish must be on or after the planned start' }
  if (data.actual_start && data.actual_end && data.actual_end < data.actual_start)
    return { actual_end: 'Actual finish must be on or after the actual start' }
  return null
}

export async function initializeScheduleAction(projectId: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('initialize_project_schedule', { p_project: projectId })
  if (error) return { error: friendlyDbError(error) }
  revalidateProject(projectId)
  return { success: data ? `Added ${data} template activities.` : 'The schedule already contains every template activity.' }
}

export async function createActivityAction(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const values = formValues(formData)
  const parsed = planSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const dateError = checkDates(parsed.data)
  if (dateError) return { error: 'Please correct the highlighted fields.', fieldErrors: dateError, values }

  const supabase = await createClient()
  const { error } = await supabase.from('schedule_activities').insert({
    ...parsed.data,
    organization_id: session.organizationId,
    project_id: projectId,
    created_by: session.userId,
    updated_by: session.userId,
  })
  if (error) return { error: friendlyDbError(error), values }
  revalidateProject(projectId)
  return { success: 'Activity added.' }
}

export async function updateActivityPlanAction(
  projectId: string,
  activityId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(activityId).success) return { error: 'Invalid activity.' }
  const values = formValues(formData)
  const parsed = planSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const dateError = checkDates(parsed.data)
  if (dateError) return { error: 'Please correct the highlighted fields.', fieldErrors: dateError, values }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedule_activities')
    .update({ ...parsed.data, updated_by: session.userId })
    .eq('id', activityId)
    .eq('project_id', projectId)
    .select('id')
  if (error) return { error: friendlyDbError(error), values }
  if (!data?.length) return { error: 'Activity not found or you do not have permission to change it.' }
  revalidateProject(projectId)
  return { success: 'Plan saved.' }
}

export async function updateActivityProgressAction(
  projectId: string,
  activityId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireStaff()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(activityId).success) return { error: 'Invalid activity.' }
  const values = formValues(formData)
  const parsed = progressSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const dateError = checkDates(parsed.data)
  if (dateError) return { error: 'Please correct the highlighted fields.', fieldErrors: dateError, values }
  if (parsed.data.status === 'delayed' && !parsed.data.delay_reason)
    return { error: 'Please correct the highlighted fields.', fieldErrors: { delay_reason: 'Explain the delay' }, values }

  const update: Record<string, unknown> = { ...parsed.data, updated_by: session.userId }
  // Reassignment is a planning decision reserved for managers.
  if (!canManage(session.role)) delete update.assigned_to
  if (parsed.data.status !== 'completed' && parsed.data.status !== 'skipped') update.actual_end = null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedule_activities')
    .update(update)
    .eq('id', activityId)
    .eq('project_id', projectId)
    .select('id')
  if (error) return { error: friendlyDbError(error), values }
  if (!data?.length) return { error: 'Activity not found or you do not have permission to change it.' }
  revalidateProject(projectId)
  return { success: 'Progress saved.' }
}

export async function deleteActivityAction(projectId: string, activityId: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(activityId).success) return { error: 'Invalid activity.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedule_activities')
    .delete()
    .eq('id', activityId)
    .eq('project_id', projectId)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Activity not found or you do not have permission to remove it.' }
  revalidateProject(projectId)
  return { success: 'Activity removed.' }
}

export async function includeOptionalActivityAction(projectId: string, key: string): Promise<ActionState> {
  const session = await requireManager()
  const def = OPTIONAL_ACTIVITIES.find((o) => o.key === key)
  if (!uuid.safeParse(projectId).success || !def) return { error: 'Invalid activity.' }
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) return { error: 'Project not found or you do not have access.' }

  const { data: rows, error: readError } = await supabase
    .from('schedule_activities')
    .select('template_key, phase, sort_order')
    .eq('project_id', projectId)
  if (readError) return { error: friendlyDbError(readError) }
  if (rows?.some((r) => r.template_key === def.key)) return { success: `${def.name} is already on this schedule.` }

  // Sit immediately before the anchor activity; otherwise at the end of the phase, otherwise at the end.
  const anchor = rows?.find((r) => r.template_key === def.beforeKey)
  const phaseOrders = (rows ?? []).filter((r) => r.phase === def.phase).map((r) => r.sort_order)
  const allOrders = (rows ?? []).map((r) => r.sort_order)
  const sortOrder = anchor
    ? Math.max(0, anchor.sort_order - 1)
    : phaseOrders.length
      ? Math.max(...phaseOrders) + 1
      : (allOrders.length ? Math.max(...allOrders) : 0) + 10

  const { error } = await supabase.from('schedule_activities').insert({
    organization_id: session.organizationId,
    project_id: projectId,
    template_key: def.key,
    name: def.name,
    phase: def.phase,
    activity_type: def.activity_type,
    weight: def.weight,
    sort_order: sortOrder,
    created_by: session.userId,
    updated_by: session.userId,
  })
  if (error) {
    if (error.code === '23505') return { success: `${def.name} is already on this schedule.` }
    return { error: friendlyDbError(error) }
  }
  revalidateProject(projectId)
  return { success: `${def.name} added to this project.` }
}

export async function excludeOptionalActivityAction(projectId: string, key: string): Promise<ActionState> {
  await requireManager()
  const def = OPTIONAL_ACTIVITIES.find((o) => o.key === key)
  if (!uuid.safeParse(projectId).success || !def) return { error: 'Invalid activity.' }
  const supabase = await createClient()
  const { data: activity, error: readError } = await supabase
    .from('schedule_activities')
    .select('id, status, percent_complete, actual_start, actual_end')
    .eq('project_id', projectId)
    .eq('template_key', def.key)
    .maybeSingle()
  if (readError) return { error: friendlyDbError(readError) }
  if (!activity) return { success: `${def.name} is not on this schedule.` }
  // Never erase recorded work; started activities should be marked Skipped instead.
  if (activity.status !== 'not_started' || Number(activity.percent_complete) > 0 || activity.actual_start || activity.actual_end)
    return { error: `${def.name} already has recorded progress. Set its status to Skipped instead of removing it.` }

  const { data, error } = await supabase
    .from('schedule_activities')
    .delete()
    .eq('id', activity.id)
    .eq('project_id', projectId)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Activity not found or you do not have permission to remove it.' }
  revalidateProject(projectId)
  return { success: `${def.name} removed from this project.` }
}

export async function addDependencyAction(
  projectId: string,
  successorId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  const predecessorId = String(formData.get('predecessor_id') ?? '')
  if (![projectId, successorId, predecessorId].every((v) => uuid.safeParse(v).success))
    return { error: 'Choose a predecessor activity.' }
  if (predecessorId === successorId) return { error: 'An activity cannot depend on itself.' }
  const supabase = await createClient()
  const { error } = await supabase.from('schedule_dependencies').insert({
    organization_id: session.organizationId,
    project_id: projectId,
    predecessor_id: predecessorId,
    successor_id: successorId,
    created_by: session.userId,
  })
  if (error) return { error: error.code === '23505' ? 'That dependency already exists.' : friendlyDbError(error) }
  revalidateProject(projectId)
  return { success: 'Dependency added.' }
}

export async function removeDependencyAction(projectId: string, dependencyId: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(dependencyId).success) return { error: 'Invalid dependency.' }
  const supabase = await createClient()
  const { error } = await supabase.from('schedule_dependencies').delete().eq('id', dependencyId).eq('project_id', projectId)
  if (error) return { error: friendlyDbError(error) }
  revalidateProject(projectId)
  return { success: 'Dependency removed.' }
}

const baselineSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  notes: z.string().trim().max(2000).optional().default(''),
})

export async function captureBaselineAction(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const values = formValues(formData)
  const parsed = baselineSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const supabase = await createClient()
  const { error } = await supabase.rpc('capture_schedule_baseline', {
    p_project: projectId,
    p_name: parsed.data.name,
    p_notes: parsed.data.notes,
  })
  if (error) return { error: friendlyDbError(error), values }
  revalidateProject(projectId)
  return { success: 'Baseline approved and locked.' }
}
