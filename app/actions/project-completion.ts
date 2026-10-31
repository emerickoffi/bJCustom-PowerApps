'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager, requireStaff } from '@/lib/session'
import { friendlyDbError, type ActionState } from '@/lib/action-state'
import { getOrgFeatures } from '@/lib/features'
import { loadCompletionReadiness } from '@/lib/completion-readiness-data'
import { GATED_REQUIREMENT_KEYS, isSubstantiveJustification } from '@/lib/completion-readiness'
import { todayIso } from '@/lib/schedule'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')

const exceptionSchema = z.object({
  key: z.enum(GATED_REQUIREMENT_KEYS),
  reason: z.string().trim().min(3, 'Enter a reason').max(200),
  justification: z.string().trim().max(2000).refine(isSubstantiveJustification, 'Explain why this can remain outstanding (at least 20 characters)'),
  follow_up_user_id: z.uuid('Choose who will follow up'),
  target_resolution_date: isoDate.nullable(),
  evidence_reference: z.string().trim().max(500).nullable(),
})

const completeSchema = z.object({
  project_id: z.uuid(),
  completion_date: isoDate,
  note: z.string().trim().max(500).nullable(),
  confirm: z.literal('yes', { error: 'Confirm that you reviewed the outstanding items' }),
})

const optional = (v: FormDataEntryValue | null) => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s === '' ? null : s
}

export async function completeProjectAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  const parsed = completeSchema.safeParse({
    project_id: formData.get('project_id'),
    completion_date: formData.get('completion_date'),
    note: optional(formData.get('note')),
    confirm: formData.get('confirm'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  const { project_id, completion_date, note } = parsed.data
  if (completion_date > todayIso()) return { error: 'The completion date cannot be in the future.' }

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', project_id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) return { error: 'Project not found.' }
  if (project.status === 'completed') return { error: 'This project has already been completed.' }

  // Re-evaluate from authoritative records right before committing; the database checks again under a row lock.
  const features = await getOrgFeatures(session.organizationId)
  const readiness = await loadCompletionReadiness(supabase, project_id, features, true)
  if (readiness.hardBlockers.length > 0) {
    return { error: `Completion is blocked: ${readiness.hardBlockers.map((b) => b.label).join(', ')}. These requirements cannot be waived.` }
  }

  const exceptions = []
  for (const blocker of readiness.blockers) {
    const prefix = `exception_${blocker.key}_`
    const result = exceptionSchema.safeParse({
      key: blocker.key,
      reason: formData.get(`${prefix}reason`) ?? '',
      justification: formData.get(`${prefix}justification`) ?? '',
      follow_up_user_id: formData.get(`${prefix}follow_up`) ?? '',
      target_resolution_date: optional(formData.get(`${prefix}target_date`)),
      evidence_reference: optional(formData.get(`${prefix}evidence`)),
    })
    if (!result.success) return { error: `${blocker.label}: ${result.error.issues[0]?.message ?? 'Complete the exception details.'}` }
    if (result.data.target_resolution_date && result.data.target_resolution_date < completion_date) {
      return { error: `${blocker.label}: the target resolution date cannot be before the completion date.` }
    }
    exceptions.push(result.data)
  }
  if (exceptions.length > 0 && session.role !== 'org_admin') {
    return { error: 'Outstanding requirements must be resolved, or an administrator must approve completion with exceptions.' }
  }

  const { error } = await supabase.rpc('complete_project', {
    p_project: project_id,
    p_completion_date: completion_date,
    p_note: note,
    p_exceptions: exceptions,
  })
  if (error) {
    if (error.code === 'PGRST202' || /function .*complete_project/i.test(error.message)) {
      return { error: 'Project completion is unavailable until the completion readiness database migration is applied.' }
    }
    return { error: friendlyDbError(error) }
  }

  revalidatePath(`/projects/${project_id}`, 'layout')
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  redirect(`/projects/${project_id}`)
}

const resolveSchema = z.object({
  project_id: z.uuid(),
  exception_id: z.uuid(),
  note: z.string().trim().min(10, 'Describe how the item was resolved (at least 10 characters)').max(2000),
})

export async function resolveCompletionExceptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireStaff()
  const parsed = resolveSchema.safeParse({
    project_id: formData.get('project_id'),
    exception_id: formData.get('exception_id'),
    note: formData.get('note') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('resolve_completion_exception', {
    p_exception: parsed.data.exception_id,
    p_note: parsed.data.note,
  })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath(`/projects/${parsed.data.project_id}`)
  return { success: 'Exception marked resolved.' }
}
