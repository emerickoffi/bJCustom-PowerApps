'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError, type ActionState } from '@/lib/action-state'
import { requirePhotosProject } from '@/lib/project-photos-data'
import { PROJECT_PHOTO_MAX_BYTES, PROJECT_PHOTO_TYPES, isProjectPhotoPath, projectPhotosPath } from '@/lib/project-photo-library'
import { MEDIA_BUCKET } from '@/lib/walkthroughs'

const registerSchema = z.object({
  project_id: z.uuid(),
  storage_path: z.string().min(1).max(400),
  file_name: z.string().trim().min(1).max(200),
  mime_type: z.enum(PROJECT_PHOTO_TYPES),
  size_bytes: z.number().int().positive().max(PROJECT_PHOTO_MAX_BYTES),
})

/** Registers an object the browser already uploaded under project-photos/{project}/. Safe to retry. */
export async function registerProjectPhotoAction(input: z.input<typeof registerSchema>): Promise<ActionState> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid photo' }
  const p = parsed.data
  if (!isProjectPhotoPath(p.project_id, p.storage_path)) return { error: 'Invalid photo location' }
  const { session, project, features } = await requirePhotosProject(p.project_id)
  if (!features.project_photos) return { error: 'Project photo uploads are turned off for your company.' }
  if (project.archived_at) return { error: 'This project is archived; photos are read-only.' }

  const supabase = await createClient()
  const { error } = await supabase.from('project_photos').insert({
    organization_id: session.organizationId,
    project_id: project.id,
    storage_path: p.storage_path,
    file_name: p.file_name,
    mime_type: p.mime_type,
    size_bytes: p.size_bytes,
    uploaded_by: session.userId,
  })
  if (error) {
    // A retried registration after a lost response: the same path is already recorded for this project.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('project_photos')
        .select('id')
        .eq('project_id', project.id)
        .eq('storage_path', p.storage_path)
        .maybeSingle()
      if (existing) {
        revalidatePath(projectPhotosPath(project.id))
        return { success: 'Photo added.' }
      }
    }
    // Never leave an unreferenced object behind when the database rejects the record.
    await supabase.storage.from(MEDIA_BUCKET).remove([p.storage_path])
    return { error: friendlyDbError(error) }
  }
  revalidatePath(projectPhotosPath(project.id))
  return { success: 'Photo added.' }
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v ? v : null))

const detailsSchema = z.object({
  project_id: z.uuid(),
  photo_id: z.uuid(),
  caption: optionalText(300),
  location: optionalText(120),
  phase: optionalText(120),
  tags: z
    .string()
    .max(600)
    .transform((v) => [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean))].map((t) => t.slice(0, 40)))
    .pipe(z.array(z.string()).max(20, 'Use up to 20 tags.')),
})

/** Edits the organizing details of a direct project photo. Photos owned by other modules are edited there. */
export async function updateProjectPhotoDetailsAction(input: z.input<typeof detailsSchema>): Promise<ActionState> {
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid details' }
  const p = parsed.data
  const { project, features } = await requirePhotosProject(p.project_id)
  if (!features.project_photos) return { error: 'Project photo uploads are turned off for your company.' }
  if (project.archived_at) return { error: 'This project is archived; photos are read-only.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_photos')
    .update({ caption: p.caption, location: p.location, phase: p.phase, tags: p.tags })
    .eq('id', p.photo_id)
    .eq('project_id', project.id)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Photo not found.' }
  revalidatePath(projectPhotosPath(project.id))
  return { success: 'Photo details saved.' }
}

const refSchema = z.object({ project_id: z.uuid(), photo_id: z.uuid() })

/**
 * Removes a direct project photo from the library. This is a soft delete: the record and the private file
 * are kept for retention. Photos owned by Daily Logs, Walkthroughs, Issues, or Client Updates cannot be
 * removed here, so their source records are never affected.
 */
export async function removeProjectPhotoAction(input: z.input<typeof refSchema>): Promise<ActionState> {
  const parsed = refSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid photo' }
  const { session, project, features } = await requirePhotosProject(parsed.data.project_id)
  if (!features.project_photos) return { error: 'Project photo uploads are turned off for your company.' }
  if (project.archived_at) return { error: 'This project is archived; photos are read-only.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_photos')
    .update({ deleted_at: new Date().toISOString(), deleted_by: session.userId })
    .eq('id', parsed.data.photo_id)
    .eq('project_id', project.id)
    .select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Photo not found.' }
  revalidatePath(projectPhotosPath(project.id))
  return { success: 'Photo removed from the library.' }
}
