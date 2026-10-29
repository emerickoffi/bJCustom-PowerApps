'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { isMissingTableError, subcontractorSchema } from '@/lib/subcontractors'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { checkSelectedProjects, parseProjectIds } from '@/lib/subcontractor-projects'

/** PostgREST code for "function not found", meaning the project assignments migration has not been applied. */
const MISSING_FUNCTION = 'PGRST202'

export async function createSubcontractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const projectIdsRaw = formData.getAll('project_ids')
  const values = { ...formValues(formData), project_ids: projectIdsRaw.filter((v) => typeof v === 'string').join(',') }
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.', values }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { error: 'Your account is not associated with an active construction company.', values }
  }
  if (!canManage(session.role)) return { error: 'Your role does not allow you to add subcontractors.', values }

  const features = await getOrgFeatures(session.organizationId)
  if (!features.subcontractors) return { error: 'Subcontractor management is not turned on for your company.', values }

  const parsed = subcontractorSchema.safeParse(values)
  const projectIds = parseProjectIds(projectIdsRaw)
  if (!parsed.success || !projectIds.ok) {
    const base = parsed.success ? { error: 'Please correct the highlighted fields.', fieldErrors: {} } : fromZodError(parsed.error)
    const fieldErrors = { ...base.fieldErrors, ...(projectIds.ok ? {} : { project_ids: projectIds.error }) }
    return { ...base, fieldErrors, values }
  }

  const supabase = await createClient()
  const ids = projectIds.ok ? projectIds.ids : []

  if (ids.length) {
    if (parsed.data.status !== 'active') {
      return {
        error: 'Please correct the highlighted fields.',
        fieldErrors: { project_ids: 'Inactive subcontractors cannot be assigned to projects. Set the status to Active or remove the projects.' },
        values,
      }
    }
    const { data: rows, error: lookupError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('organization_id', session.organizationId)
      .in('id', ids)
    if (lookupError) return { error: friendlyDbError(lookupError), values }
    const problem = checkSelectedProjects(ids, rows ?? [], projectAcceptsNewAssignments)
    if (problem) return { error: 'Please correct the highlighted fields.', fieldErrors: { project_ids: problem }, values }
  }

  const { error } = ids.length
    ? await supabase.rpc('create_subcontractor_with_projects', {
        p_organization_id: session.organizationId,
        p_company_name: parsed.data.company_name,
        p_trade: parsed.data.trade,
        p_email: parsed.data.email,
        p_phone: parsed.data.phone,
        p_status: parsed.data.status,
        p_project_ids: ids,
      })
    : await supabase.from('subcontractor_companies').insert({ ...parsed.data, organization_id: session.organizationId })

  if (error) {
    if (error.code === '23505') {
      return {
        error: 'Please correct the highlighted fields.',
        fieldErrors: { company_name: 'A subcontractor with this company name already exists' },
        values,
      }
    }
    if (error.code === MISSING_FUNCTION || (ids.length && isMissingTableError(error))) {
      return {
        error: 'Project assignment storage is not set up yet, so nothing was saved. Remove the selected projects to save the company now, or ask an administrator to apply the database migration.',
        values,
      }
    }
    if (isMissingTableError(error)) {
      return { error: 'Subcontractor storage is not set up yet. Ask an administrator to apply the database migration.', values }
    }
    if (error.code === 'P0001' && error.message) {
      return { error: `Nothing was saved. ${error.message}.`, fieldErrors: ids.length ? { project_ids: error.message } : undefined, values }
    }
    return { error: friendlyDbError(error), values }
  }

  revalidatePath('/subcontractors')
  const added = new URLSearchParams({ added: parsed.data.company_name })
  if (ids.length) added.set('projects', String(ids.length))
  redirect(`/subcontractors?${added.toString()}`)
}
