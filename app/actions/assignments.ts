'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { assignSchema, revokeSchema } from '@/lib/assignments'
import { isMissingTableError } from '@/lib/subcontractors'
import { projectAcceptsNewAssignments } from '@/lib/domain'

const idSchema = z.uuid()

async function authorize(): Promise<{ error: string } | { organizationId: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return { error: 'Your account is not associated with an active construction company.' }
  }
  if (!canManage(session.role)) return { error: 'Only administrators and project managers can assign subcontractors.' }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.subcontractors || !features.schedule) {
    return { error: 'Subcontractor assignments require the Schedule and Subcontractors features.' }
  }
  return { organizationId: session.organizationId }
}

const INELIGIBLE_PROJECT =
  'New subcontractor work can only be assigned while a project is in preconstruction, construction, or closeout.'

/** Loads the project through RLS, so projects the viewer cannot access are treated as not found. */
async function checkProjectEligibility(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  projectId: string,
): Promise<string | null> {
  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('id', projectId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!project) return 'This project could not be found.'
  return projectAcceptsNewAssignments(project.status) ? null : INELIGIBLE_PROJECT
}

function dbError(error: { code?: string; message?: string }): string {
  if (isMissingTableError(error)) return 'Assignment storage is not set up yet. Ask an administrator to apply the database migration.'
  if (error.code === '23505') return 'This subcontractor already has an active assignment on this activity.'
  // Trigger messages (P0001) are written for people and contain no internal detail.
  return friendlyDbError(error)
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}/schedule`)
  revalidatePath('/subcontractors')
  revalidatePath('/dashboard')
}

export async function assignSubcontractorAction(
  projectId: string,
  activityId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData)
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(activityId).success) {
    return { error: 'This activity could not be found.', values }
  }
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error, values }
  const parsed = assignSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const ineligible = await checkProjectEligibility(supabase, auth.organizationId, projectId)
  if (ineligible) return { error: ineligible, values }

  const { data: activity } = await supabase
    .from('schedule_activities')
    .select('id')
    .eq('id', activityId)
    .eq('project_id', projectId)
    .eq('organization_id', auth.organizationId)
    .maybeSingle()
  if (!activity) return { error: 'This activity could not be found.', values }

  // organization_id and project_id are overwritten from the activity by the database trigger.
  const { error } = await supabase.from('schedule_activity_assignments').insert({
    organization_id: auth.organizationId,
    project_id: projectId,
    schedule_activity_id: activityId,
    subcontractor_company_id: parsed.data.subcontractor_company_id,
    scope_of_work: parsed.data.scope_of_work,
  })
  if (error) return { error: dbError(error), values }

  refresh(projectId)
  return { success: 'Subcontractor assigned.' }
}

export async function reassignSubcontractorAction(
  projectId: string,
  assignmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData)
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(assignmentId).success) {
    return { error: 'This assignment could not be found.', values }
  }
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error, values }
  const parsed = assignSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const ineligible = await checkProjectEligibility(supabase, auth.organizationId, projectId)
  if (ineligible) return { error: ineligible, values }

  const { error } = await supabase.rpc('reassign_schedule_assignment', {
    p_id: assignmentId,
    p_company: parsed.data.subcontractor_company_id,
    p_scope: parsed.data.scope_of_work,
  })
  if (error) return { error: dbError(error), values }

  refresh(projectId)
  return { success: 'Assignment updated. The previous assignment is kept in history.' }
}

export async function revokeAssignmentAction(
  projectId: string,
  assignmentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const values = formValues(formData)
  if (!idSchema.safeParse(projectId).success || !idSchema.safeParse(assignmentId).success) {
    return { error: 'This assignment could not be found.', values }
  }
  const auth = await authorize()
  if ('error' in auth) return { error: auth.error, values }
  const parsed = revokeSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('schedule_activity_assignments')
    .update({ status: 'revoked', revoke_reason: parsed.data.revoke_reason })
    .eq('id', assignmentId)
    .eq('project_id', projectId)
    .eq('status', 'active')
    .select('id')
  if (error) return { error: dbError(error), values }
  if (!data?.length) return { error: 'This assignment was already revoked or could not be found.', values }

  refresh(projectId)
  return { success: 'Assignment revoked. It stays in the assignment history.' }
}
