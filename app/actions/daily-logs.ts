'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { requireDailyLogProject, getCrewCompanyOptions, getOrgToday, getScheduleActivityOptions } from '@/lib/daily-logs-data'
import {
  DAILY_LOG_PHOTO_MAX_BYTES,
  DAILY_LOG_PHOTO_TYPES,
  dailyLogPath,
  dailyLogsPath,
  isDailyLogPhotoPath,
  parseDailyLogForm,
} from '@/lib/daily-logs'

const idsSchema = z.object({
  project_id: z.uuid(),
  id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  version: z.coerce.number().int().min(1).max(1_000_000).optional(),
})

export async function saveDailyLogAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ids = idsSchema.safeParse({
    project_id: formData.get('project_id'),
    id: formData.get('id') ?? undefined,
    version: formData.get('version') || undefined,
  })
  if (!ids.success) return { error: 'This form is out of date. Reload the page and try again.' }
  const { session, project } = await requireDailyLogProject(ids.data.project_id)
  if (project.archived_at) return { error: 'This project is archived; daily logs are read-only.' }

  const supabase = await createClient()
  const [today, activities, companies, existingCrews] = await Promise.all([
    getOrgToday(session.organizationId),
    getScheduleActivityOptions(project.id),
    getCrewCompanyOptions(session.organizationId),
    ids.data.id
      ? supabase.from('daily_log_crews').select('subcontractor_company_id').eq('daily_log_id', ids.data.id).not('subcontractor_company_id', 'is', null)
      : Promise.resolve({ data: [] as { subcontractor_company_id: string | null }[] }),
  ])
  // A company already recorded on this log stays valid even if it was later deactivated.
  const allowedCompanyIds = new Set([
    ...companies.map((c) => c.id),
    ...(existingCrews.data ?? []).map((c) => c.subcontractor_company_id).filter((v): v is string => Boolean(v)),
  ])
  const parsed = parseDailyLogForm(formData, { today, allowedActivityIds: new Set(activities.map((a) => a.id)), allowedCompanyIds })
  if (!parsed.ok) return { error: parsed.error, fieldErrors: parsed.fieldErrors, values: formValues(formData) }
  if (ids.data.id && !ids.data.version) return { error: 'This form is out of date. Reload the page and try again.' }

  const { data: logId, error } = await supabase.rpc('save_daily_log', {
    p_project: project.id,
    p_id: ids.data.id,
    p_expected_version: ids.data.version ?? 1,
    p_header: parsed.header,
    p_crews: parsed.crews,
    p_activity_ids: parsed.activityIds,
  })
  if (error || !logId) {
    const message = error?.code === '23505' ? 'A daily log already exists for this date. Open it from the log history instead.' : friendlyDbError(error)
    return { error: message, values: formValues(formData) }
  }

  revalidatePath(dailyLogsPath(project.id))
  redirect(`${dailyLogPath(project.id, logId as string)}?saved=1`)
}

export async function finalizeDailyLogAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ids = idsSchema.safeParse({
    project_id: formData.get('project_id'),
    id: formData.get('id') ?? undefined,
    version: formData.get('version') || undefined,
  })
  if (!ids.success || !ids.data.id || !ids.data.version) return { error: 'This page is out of date. Reload and try again.' }
  if (formData.get('confirm') !== 'yes') return { error: 'Confirm that the log is complete and accurate before finalizing.' }
  const { project } = await requireDailyLogProject(ids.data.project_id)
  if (project.archived_at) return { error: 'This project is archived; daily logs are read-only.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('finalize_daily_log', { p_id: ids.data.id, p_expected_version: ids.data.version })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(dailyLogsPath(project.id))
  revalidatePath(dailyLogPath(project.id, ids.data.id))
  return { success: 'Daily log finalized. It is now a permanent record.' }
}

const photoSchema = z.object({
  project_id: z.uuid(),
  log_id: z.uuid(),
  storage_path: z.string().min(1).max(400),
  file_name: z.string().trim().min(1).max(200),
  mime_type: z.enum(DAILY_LOG_PHOTO_TYPES),
  size_bytes: z.coerce.number().int().positive().max(DAILY_LOG_PHOTO_MAX_BYTES),
  caption: z
    .string()
    .trim()
    .max(300, 'Captions must be 300 characters or fewer')
    .transform((v) => (v === '' ? null : v)),
})

/** Registers an object the browser has already uploaded to the private bucket under this log's folder. */
export async function registerDailyLogPhotoAction(input: z.input<typeof photoSchema>): Promise<ActionState> {
  const parsed = photoSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid photo' }
  const p = parsed.data
  if (!isDailyLogPhotoPath(p.log_id, p.storage_path)) return { error: 'Invalid photo location' }
  const { session, project } = await requireDailyLogProject(p.project_id)
  if (project.archived_at) return { error: 'This project is archived; daily logs are read-only.' }

  const supabase = await createClient()
  const { error } = await supabase.from('daily_log_photos').insert({
    organization_id: session.organizationId,
    daily_log_id: p.log_id,
    storage_path: p.storage_path,
    file_name: p.file_name,
    mime_type: p.mime_type,
    size_bytes: p.size_bytes,
    caption: p.caption,
  })
  if (error) {
    // Never leave an orphaned object behind when the database rejects the record.
    await supabase.storage.from('project-media').remove([p.storage_path])
    return { error: friendlyDbError(error) }
  }
  revalidatePath(dailyLogPath(project.id, p.log_id))
  return { success: 'Photo added.' }
}

const photoRefSchema = z.object({ project_id: z.uuid(), log_id: z.uuid(), photo_id: z.uuid() })

export async function updateDailyLogPhotoCaptionAction(input: z.input<typeof photoRefSchema> & { caption: string }): Promise<ActionState> {
  const parsed = photoRefSchema.safeParse(input)
  const caption = typeof input.caption === 'string' ? input.caption.trim() : ''
  if (!parsed.success) return { error: 'Invalid photo' }
  if (caption.length > 300) return { error: 'Captions must be 300 characters or fewer' }
  const { project } = await requireDailyLogProject(parsed.data.project_id)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('daily_log_photos')
    .update({ caption: caption || null })
    .eq('id', parsed.data.photo_id)
    .eq('daily_log_id', parsed.data.log_id)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Photo not found.' }
  revalidatePath(dailyLogPath(project.id, parsed.data.log_id))
  return { success: 'Caption saved.' }
}

export async function removeDailyLogPhotoAction(input: z.input<typeof photoRefSchema>): Promise<ActionState> {
  const parsed = photoRefSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid photo' }
  const { project } = await requireDailyLogProject(parsed.data.project_id)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('daily_log_photos')
    .delete()
    .eq('id', parsed.data.photo_id)
    .eq('daily_log_id', parsed.data.log_id)
    .select('storage_path')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Photo not found.' }
  // The record goes first so a storage hiccup can only leave an unreferenced (still private) object.
  await supabase.storage.from('project-media').remove(data.map((r) => r.storage_path as string))
  revalidatePath(dailyLogPath(project.id, parsed.data.log_id))
  return { success: 'Photo removed.' }
}
