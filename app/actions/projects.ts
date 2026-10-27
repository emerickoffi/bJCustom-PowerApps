'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { projectSchema, statusChangeSchema } from '@/lib/validation'
import { isStatusTransitionAllowed, type ProjectStatus } from '@/lib/domain'

const uuid = z.uuid()

function toProjectRow(data: z.infer<typeof projectSchema>) {
  const { estimated_budget, ...rest } = data
  return { ...rest, estimated_budget_cents: estimated_budget }
}

export async function createProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  const parsed = projectSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .insert({
      ...toProjectRow(parsed.data),
      organization_id: session.organizationId,
      created_by: session.userId,
      updated_by: session.userId,
      project_number: 'pending',
    })
    .select('id')
    .single()
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/projects')
  revalidatePath('/dashboard')
  redirect(`/projects/${data.id}`)
}

export async function updateProjectAction(
  projectId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success) return { error: 'Invalid project.' }
  const parsed = projectSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase
    .from('projects')
    .update({ ...toProjectRow(parsed.data), updated_by: session.userId })
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  redirect(`/projects/${projectId}`)
}

export async function changeProjectStatusAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireManager()
  const parsed = statusChangeSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

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
