'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { projectSchema, statusChangeSchema } from '@/lib/validation'
import { isStatusTransitionAllowed, type ProjectStatus } from '@/lib/domain'
import { getOrgFeatures } from '@/lib/features'
import { includeOptionalActivityAction, initializeScheduleAction } from '@/app/actions/schedule'
import { isCoverKind, isCoverPathForOrg } from '@/lib/project-cover'
import { MEDIA_BUCKET } from '@/lib/walkthroughs'

const uuid = z.uuid()

function toProjectRow(data: z.infer<typeof projectSchema>) {
  const { estimated_budget, ...rest } = data
  return { ...rest, estimated_budget_cents: estimated_budget }
}

type CoverChange = { action: 'keep' | 'remove' } | { action: 'replace'; path: string }

/** The browser uploads the file first; the action only accepts a fresh org-scoped storage key. */
function readCoverChange(values: Record<string, string>, orgId: string): CoverChange | { error: string } {
  if (values.cover_action === 'remove') return { action: 'remove' }
  if (values.cover_action !== 'replace') return { action: 'keep' }
  const path = values.cover_image_path ?? ''
  if (!isCoverPathForOrg(path, orgId)) return { error: 'The cover image upload is not valid. Please choose it again.' }
  return { action: 'replace', path }
}

async function discardCoverUpload(supabase: Awaited<ReturnType<typeof createClient>>, change: CoverChange | { error: string }) {
  if ('path' in change) await supabase.storage.from(MEDIA_BUCKET).remove([change.path])
}

/** Removes a replaced cover only when no other project still references it. */
async function removeCoverIfUnused(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null) {
  if (!path) return
  const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('cover_image_path', path)
  if (!count) await supabase.storage.from(MEDIA_BUCKET).remove([path])
}

async function coverPathInUse(supabase: Awaited<ReturnType<typeof createClient>>, path: string) {
  const { count } = await supabase.from('projects').select('id', { count: 'exact', head: true }).eq('cover_image_path', path)
  return Boolean(count)
}

function withoutCoverValues(values: Record<string, string>) {
  const { cover_image_path: _path, cover_action: _action, ...rest } = values
  return rest
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  const allValues = formValues(formData)
  const values = withoutCoverValues(allValues)
  const supabase = await createClient()
  const cover = readCoverChange(allValues, session.organizationId)
  if ('error' in cover) return { error: cover.error, fieldErrors: { cover_image: cover.error }, values }

  const parsed = projectSchema.safeParse(values)
  if (!parsed.success) {
    await discardCoverUpload(supabase, cover)
    return { ...fromZodError(parsed.error), values }
  }
  if (cover.action === 'replace' && (await coverPathInUse(supabase, cover.path))) {
    return { error: 'The cover image upload is not valid. Please choose it again.', values }
  }
  const coverKind = isCoverKind(values.cover_image_kind) ? values.cover_image_kind : null

  // The cover reference is written in the same insert, so a project is never created twice
  // and a failed insert leaves no stored image behind.
  const { data, error } = await supabase
    .from('projects')
    .insert({
      ...toProjectRow(parsed.data),
      ...(cover.action === 'replace'
        ? { cover_image_path: cover.path, cover_image_kind: coverKind, cover_image_updated_at: new Date().toISOString() }
        : {}),
      organization_id: session.organizationId,
      created_by: session.userId,
      updated_by: session.userId,
      project_number: 'pending',
    })
    .select('id')
    .single()
  if (error) {
    await discardCoverUpload(supabase, cover)
    return { error: friendlyDbError(error), values }
  }

  revalidatePath('/projects')
  revalidatePath('/dashboard')

  // Optional schedule setup runs only after the project is persisted. Both steps are idempotent,
  // and a failure here never rolls back the project; the builder is sent to the schedule to retry.
  const features = await getOrgFeatures(session.organizationId)
  if (features.schedule && values.schedule_setup === 'standard') {
    const init = await initializeScheduleAction(data.id)
    const sprinkler =
      !init.error && values.include_sprinkler === 'on'
        ? await includeOptionalActivityAction(data.id, 'sprinkler_irrigation')
        : null
    if (init.error || sprinkler?.error) redirect(`/projects/${data.id}/schedule?setup=incomplete`)
  }

  redirect(`/projects/${data.id}`)
}

export async function updateProjectAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const allValues = formValues(formData)
  const values = withoutCoverValues(allValues)
  const supabase = await createClient()
  const cover = readCoverChange(allValues, session.organizationId)
  if ('error' in cover) return { error: cover.error, fieldErrors: { cover_image: cover.error }, values }

  const parsed = projectSchema.safeParse(values)
  if (!parsed.success) {
    await discardCoverUpload(supabase, cover)
    return { ...fromZodError(parsed.error), values }
  }

  const { data: current } = await supabase
    .from('projects')
    .select('cover_image_path')
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!current) {
    await discardCoverUpload(supabase, cover)
    return { error: 'Project not found.' }
  }
  if (cover.action === 'replace' && (await coverPathInUse(supabase, cover.path))) {
    return { error: 'The cover image upload is not valid. Please choose it again.', values }
  }

  const previousPath = current.cover_image_path as string | null
  const nextPath = cover.action === 'replace' ? cover.path : cover.action === 'remove' ? null : previousPath
  const coverKind = nextPath && isCoverKind(values.cover_image_kind) ? values.cover_image_kind : null

  const { error } = await supabase
    .from('projects')
    .update({
      ...toProjectRow(parsed.data),
      cover_image_path: nextPath,
      cover_image_kind: coverKind,
      ...(nextPath !== previousPath ? { cover_image_updated_at: nextPath ? new Date().toISOString() : null } : {}),
      updated_by: session.userId,
    })
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
  if (error) {
    await discardCoverUpload(supabase, cover)
    return { error: friendlyDbError(error), values }
  }
  if (previousPath && previousPath !== nextPath) await removeCoverIfUnused(supabase, previousPath)

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  redirect(`/projects/${projectId}`)
}

export async function changeProjectStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager()
  const parsed = statusChangeSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  if (parsed.data.status === 'completed') {
    return { error: 'Use the completion review to mark a project Completed.' }
  }

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('id', parsed.data.project_id)
    .maybeSingle()
  if (!project) return { error: 'Project not found.' }
  if (!isStatusTransitionAllowed(project.status as ProjectStatus, parsed.data.status as ProjectStatus)) {
    return { error: 'That status change is not allowed.' }
  }

  const { error } = await supabase.rpc('change_project_status', {
    p_project: parsed.data.project_id,
    p_status: parsed.data.status,
    p_note: parsed.data.note,
  })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/projects/${parsed.data.project_id}`)
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { success: 'Project status updated.' }
}

const projectClientSchema = z.object({
  client_id: z.uuid('Select a client'),
  relationship: z.enum(['co_owner', 'authorized_contact']),
})

export async function addProjectClientAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const parsed = projectClientSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('project_clients').insert({
    project_id: projectId,
    client_id: parsed.data.client_id,
    relationship: parsed.data.relationship,
    organization_id: session.organizationId,
    created_by: session.userId,
  })
  if (error) {
    if (error.code === '23505') return { error: 'That client is already linked to this project.' }
    return { error: friendlyDbError(error) }
  }

  revalidatePath(`/projects/${projectId}`)
  return { success: 'Client linked to project.' }
}

export async function removeProjectClientAction(projectId: string, linkId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(linkId).success) return { error: 'Invalid link.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('project_clients')
    .delete()
    .eq('id', linkId)
    .eq('project_id', projectId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/projects/${projectId}`)
  return { success: 'Client removed from project.' }
}

const projectMemberSchema = z.object({
  user_id: z.uuid('Select a team member'),
  project_role: z.enum(['project_manager', 'staff', 'viewer']),
})

export async function addProjectMemberAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const parsed = projectMemberSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('project_members').insert({
    project_id: projectId,
    user_id: parsed.data.user_id,
    project_role: parsed.data.project_role,
    organization_id: session.organizationId,
    created_by: session.userId,
  })
  if (error) {
    if (error.code === '23505') return { error: 'That person is already on this project.' }
    return { error: friendlyDbError(error) }
  }

  revalidatePath(`/projects/${projectId}`)
  return { success: 'Team member added.' }
}

export async function removeProjectMemberAction(projectId: string, memberId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(memberId).success) return { error: 'Invalid member.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', memberId)
    .eq('project_id', projectId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/projects/${projectId}`)
  return { success: 'Team member removed.' }
}
