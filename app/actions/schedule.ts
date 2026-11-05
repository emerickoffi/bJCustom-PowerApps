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
  phase_id: z.string({ error: 'Select a phase' }).pipe(z.uuid({ error: 'Select a phase' })),
  activity_type: z.enum(ACTIVITY_TYPES),
  planned_start: optionalDate,
  planned_end: optionalDate,
  weight: z.coerce.number().min(0, 'Weight cannot be negative').max(1000),
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

const restoreKeys = z.array(z.string().trim().min(1).max(200)).max(500)

export async function initializeScheduleAction(
  projectId: string,
  restoreActivities: string[] = [],
  restorePhases: string[] = [],
): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const activities = restoreKeys.safeParse(restoreActivities)
  const phases = restoreKeys.safeParse(restorePhases)
  if (!activities.success || !phases.success) return { error: 'Invalid restore selection.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('initialize_project_schedule', {
    p_project: projectId,
    p_restore_activities: activities.data,
    p_restore_phases: phases.data,
  })
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
  const { data: phase } = await supabase
    .from('schedule_phases')
    .select('id')
    .eq('id', parsed.data.phase_id)
    .eq('project_id', projectId)
    .maybeSingle()
  if (!phase) return { error: 'Please correct the highlighted fields.', fieldErrors: { phase_id: 'Select a phase from this project' }, values }

  const { error } = await supabase.from('schedule_activities').insert({
    ...parsed.data,
    // Appended to the end of the chosen phase; renumbering compacts it.
    sort_order: APPEND_ORDER,
    organization_id: session.organizationId,
    project_id: projectId,
    created_by: session.userId,
    updated_by: session.userId,
  })
  if (error) return { error: friendlyDbError(error), values }
  await supabase.rpc('renumber_project_schedule', { p_project: projectId })
  revalidateProject(projectId)
  return { success: 'Activity added.' }
}

/** Sorts after every existing activity in a phase until renumber_project_schedule compacts the order. */
const APPEND_ORDER = 1_000_000

const phaseNameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1, 'Enter a phase name').max(80, 'Use 80 characters or fewer'))

export type SchedulePhaseResult = ActionState & { phase?: { id: string; name: string } }

async function findPhaseByName(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string, name: string, exceptId?: string) {
  const { data } = await supabase.from('schedule_phases').select('id, name').eq('project_id', projectId)
  return (data ?? []).find((p) => p.name.trim().toLowerCase() === name.toLowerCase() && p.id !== exceptId) ?? null
}

export async function createPhaseAction(projectId: string, rawName: string): Promise<SchedulePhaseResult> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const parsed = phaseNameSchema.safeParse(rawName ?? '')
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter a phase name' }
  const name = parsed.data
  const supabase = await createClient()

  const existing = await findPhaseByName(supabase, projectId, name)
  if (existing) return { error: `A phase named "${existing.name}" already exists on this schedule.`, phase: existing }

  const { data: last } = await supabase
    .from('schedule_phases')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabase
    .from('schedule_phases')
    .insert({ organization_id: session.organizationId, project_id: projectId, name, sort_order: (last?.sort_order ?? 0) + 10 })
    .select('id, name')
    .single()
  if (error) {
    // A concurrent request created it first: reuse that phase rather than failing or duplicating.
    if (error.code === '23505') {
      const raced = await findPhaseByName(supabase, projectId, name)
      if (raced) return { success: `Phase "${raced.name}" selected.`, phase: raced }
    }
    return { error: friendlyDbError(error) }
  }
  revalidateProject(projectId)
  return { success: `Phase "${data.name}" created.`, phase: data }
}

export async function renamePhaseAction(projectId: string, phaseId: string, rawName: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(phaseId).success) return { error: 'Invalid phase.' }
  const parsed = phaseNameSchema.safeParse(rawName ?? '')
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Enter a phase name' }
  const supabase = await createClient()
  const clash = await findPhaseByName(supabase, projectId, parsed.data, phaseId)
  if (clash) return { error: `A phase named "${clash.name}" already exists on this schedule.` }
  const { data, error } = await supabase
    .from('schedule_phases')
    .update({ name: parsed.data })
    .eq('id', phaseId)
    .eq('project_id', projectId)
    .select('id')
  if (error) return { error: error.code === '23505' ? 'Another phase already uses that name.' : friendlyDbError(error) }
  if (!data?.length) return { error: 'Phase not found or you do not have permission to change it.' }
  revalidateProject(projectId)
  return { success: 'Phase renamed.' }
}

export async function movePhaseAction(projectId: string, phaseId: string, direction: 'up' | 'down'): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(phaseId).success) return { error: 'Invalid phase.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('move_schedule_phase', { p_phase: phaseId, p_direction: direction === 'up' ? -1 : 1 })
  if (error) return { error: friendlyDbError(error) }
  revalidateProject(projectId)
  return { success: 'Phase moved.' }
}

export async function moveActivityAction(projectId: string, activityId: string, direction: 'up' | 'down'): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(activityId).success) return { error: 'Invalid activity.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('move_schedule_activity', { p_activity: activityId, p_direction: direction === 'up' ? -1 : 1 })
  if (error) return { error: friendlyDbError(error) }
  revalidateProject(projectId)
  return { success: 'Activity moved.' }
}

export async function removePhaseAction(
  projectId: string,
  phaseId: string,
  mode: 'empty' | 'move' | 'delete',
  targetPhaseId: string | null,
): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(phaseId).success) return { error: 'Invalid phase.' }
  if (!['empty', 'move', 'delete'].includes(mode)) return { error: 'Choose how to handle the activities in this phase.' }
  if (mode === 'move' && !uuid.safeParse(targetPhaseId).success) return { error: 'Choose a phase to move the activities to.' }
  const supabase = await createClient()
  const { data: phase } = await supabase.from('schedule_phases').select('id').eq('id', phaseId).eq('project_id', projectId).maybeSingle()
  if (!phase) return { error: 'Phase not found or you do not have permission to change it.' }
  const { data, error } = await supabase.rpc('remove_schedule_phase', {
    p_phase: phaseId,
    p_mode: mode,
    p_target: mode === 'move' ? targetPhaseId : null,
  })
  if (error) return { error: friendlyDbError(error) }
  revalidateProject(projectId)
  const count = Number(data ?? 0)
  if (mode === 'move' && count) return { success: `Phase removed. ${count} ${count === 1 ? 'activity was' : 'activities were'} moved.` }
  if (mode === 'delete' && count) return { success: `Phase and ${count} ${count === 1 ? 'activity' : 'activities'} removed.` }
  return { success: 'Phase removed.' }
}

export type TemplateRestorePreview = {
  toAdd: { key: string; name: string; phase: string }[]
  removedPhases: { key: string; name: string; activityCount: number }[]
  removedActivities: { key: string; name: string; phase: string }[]
}

export async function previewTemplateRestoreAction(
  projectId: string,
): Promise<{ error?: string; preview?: TemplateRestorePreview }> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const supabase = await createClient()
  const [itemsRes, activitiesRes, exclusionsRes] = await Promise.all([
    supabase
      .from('schedule_template_items')
      .select('template_key, name, phase, sort_order')
      .eq('organization_id', session.organizationId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('schedule_activities').select('template_key').eq('project_id', projectId).not('template_key', 'is', null),
    supabase.from('schedule_template_exclusions').select('item_type, item_key, item_name').eq('project_id', projectId),
  ])
  if (itemsRes.error || activitiesRes.error || exclusionsRes.error) return { error: 'Could not load the template. Please try again.' }

  const present = new Set((activitiesRes.data ?? []).map((a) => a.template_key as string))
  const excludedActivities = new Set((exclusionsRes.data ?? []).filter((x) => x.item_type === 'activity').map((x) => x.item_key))
  const excludedPhases = new Map(
    (exclusionsRes.data ?? []).filter((x) => x.item_type === 'phase').map((x) => [x.item_key, x.item_name] as const),
  )

  const preview: TemplateRestorePreview = { toAdd: [], removedPhases: [], removedActivities: [] }
  const phaseCounts = new Map<string, number>()
  for (const item of itemsRes.data ?? []) {
    // Renamed template activities keep their template_key, so they count as present and are never duplicated.
    if (present.has(item.template_key)) continue
    const phaseKey = item.phase.trim().toLowerCase()
    if (excludedPhases.has(phaseKey)) phaseCounts.set(phaseKey, (phaseCounts.get(phaseKey) ?? 0) + 1)
    else if (excludedActivities.has(item.template_key))
      preview.removedActivities.push({ key: item.template_key, name: item.name, phase: item.phase })
    else preview.toAdd.push({ key: item.template_key, name: item.name, phase: item.phase })
  }
  for (const [key, count] of phaseCounts)
    preview.removedPhases.push({ key, name: excludedPhases.get(key) ?? key, activityCount: count })
  return { preview }
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
  const [{ data: current }, { data: phase }] = await Promise.all([
    supabase.from('schedule_activities').select('phase_id').eq('id', activityId).eq('project_id', projectId).maybeSingle(),
    supabase.from('schedule_phases').select('id').eq('id', parsed.data.phase_id).eq('project_id', projectId).maybeSingle(),
  ])
  if (!current) return { error: 'Activity not found or you do not have permission to change it.' }
  if (!phase) return { error: 'Please correct the highlighted fields.', fieldErrors: { phase_id: 'Select a phase from this project' }, values }
  const movedPhase = current.phase_id !== parsed.data.phase_id

  const { data, error } = await supabase
    .from('schedule_activities')
    // Moving phases appends the activity to the end of its new phase. Dates and links are untouched.
    .update({ ...parsed.data, ...(movedPhase ? { sort_order: APPEND_ORDER } : {}), updated_by: session.userId })
    .eq('id', activityId)
    .eq('project_id', projectId)
    .select('id')
  if (error) return { error: friendlyDbError(error), values }
  if (!data?.length) return { error: 'Activity not found or you do not have permission to change it.' }
  if (movedPhase) await supabase.rpc('renumber_project_schedule', { p_project: projectId })
  revalidateProject(projectId)
  return { success: movedPhase ? 'Plan saved and activity moved to its new phase.' : 'Plan saved.' }
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
  await supabase.rpc('renumber_project_schedule', { p_project: projectId })
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
