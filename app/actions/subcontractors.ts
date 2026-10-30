'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { OVERLAY_FIELD, fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { CONTACT_PERSONS_FIELD, parseContactPersons } from '@/lib/subcontractor-contact-persons'
import { precheckContactPersons, saveContactPersons } from '@/lib/subcontractor-contact-persons-save'
import { isMissingTableError, subcontractorSchema } from '@/lib/subcontractors'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import {
  checkSelectedProjects,
  isAssignmentSetupError,
  isUuid,
  newProjectIds,
  parseEndReason,
  parseProjectIds,
} from '@/lib/subcontractor-projects'
import type { StaffSession } from '@/lib/session'

/** PostgREST code for "function not found", meaning the project assignments migration has not been applied. */
const MISSING_FUNCTION = 'PGRST202'

export async function createSubcontractorAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const projectIdsRaw = formData.getAll('project_ids')
  const values: Record<string, string> = { ...formValues(formData), project_ids: projectIdsRaw.filter((v) => typeof v === 'string').join(',') }
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
  const contacts = parseContactPersons(values[CONTACT_PERSONS_FIELD])
  const invalid = invalidFormState(parsed, projectIds, contacts, values)
  if (invalid || !parsed.success || !contacts.ok) return invalid ?? { error: 'Please correct the highlighted fields.', values }
  const contactItems = contacts.items.filter((i) => i.kind !== 'current')

  const supabase = await createClient()
  const ids = projectIds.ok ? projectIds.ids : []

  const contactProblem = await precheckContactPersons(supabase, session.organizationId, contactItems)
  if (contactProblem) {
    return 'error' in contactProblem
      ? { error: contactProblem.error as string, values }
      : { error: 'Please correct the highlighted contact persons.', fieldErrors: contactProblem, values }
  }

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

  const { data: createdId, error } = ids.length
    ? await supabase.rpc('create_subcontractor_with_projects', {
        p_organization_id: session.organizationId,
        p_company_name: parsed.data.company_name,
        p_trade: parsed.data.trade,
        p_email: parsed.data.email,
        p_phone: parsed.data.phone,
        p_status: parsed.data.status,
        p_project_ids: ids,
      })
    : await supabase
        .from('subcontractor_companies')
        .insert({ ...parsed.data, organization_id: session.organizationId })
        .select('id')
        .single()
        .then((r) => ({ data: (r.data?.id as string | undefined) ?? null, error: r.error }))

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

  const newId = typeof createdId === 'string' ? createdId : null
  const saved = newId
    ? await saveContactPersons(supabase, session as StaffSession, newId, contactItems)
    : { problem: contactItems.length ? 'Contact persons were not saved. Open the subcontractor to add them.' : null, personIds: [] }

  revalidatePath('/subcontractors')
  revalidatePath('/contacts')
  for (const id of saved.personIds) revalidatePath(`/contacts/people/${id}`)
  const name = parsed.data.company_name
  if (values[OVERLAY_FIELD] === '1') {
    return {
      success: createdSummary(name, ids.length, saved.problem ? 0 : contactItems.length),
      savedId: newId ?? 'created',
      warning: saved.problem ? `${name} was saved. ${saved.problem}` : undefined,
    }
  }
  if (saved.problem && newId) redirect(`/subcontractors/${newId}?${new URLSearchParams({ warning: saved.problem }).toString()}`)
  const added = new URLSearchParams({ added: name })
  if (ids.length) added.set('projects', String(ids.length))
  redirect(`/subcontractors?${added.toString()}`)
}

function createdSummary(name: string, projects: number, people: number) {
  const parts: string[] = []
  if (people) parts.push(`${people} ${people === 1 ? 'contact person' : 'contact persons'}`)
  if (projects) parts.push(`${projects} ${projects === 1 ? 'project' : 'projects'}`)
  return parts.length ? `${name} was added with ${parts.join(' and ')}.` : `${name} was added to your subcontractors.`
}

/** Combines company, project, and contact-person validation into one response so every problem shows at once. */
function invalidFormState(
  parsed: ReturnType<typeof subcontractorSchema.safeParse>,
  projectIds: ReturnType<typeof parseProjectIds>,
  contacts: ReturnType<typeof parseContactPersons>,
  values: Record<string, string>,
): ActionState | null {
  if (parsed.success && projectIds.ok && contacts.ok) return null
  const base = parsed.success ? { error: 'Please correct the highlighted fields.', fieldErrors: {} } : fromZodError(parsed.error)
  const fieldErrors = {
    ...base.fieldErrors,
    ...(projectIds.ok ? {} : { project_ids: projectIds.error }),
    ...(contacts.ok ? {} : contacts.fieldErrors),
  }
  const error = !parsed.success || !projectIds.ok ? base.error : contacts.ok ? base.error : contacts.error
  return { error, fieldErrors, values }
}

type ManagerCheck = { ok: true; session: StaffSession } | { ok: false; error: string }

/** Same gate as create: a signed-in admin or project manager whose organization has the feature on. */
async function requireSubcontractorManager(verb: string): Promise<ManagerCheck> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { ok: false, error: 'Your account is not associated with an active construction company.' }
  }
  if (!canManage(session.role)) return { ok: false, error: `Your role does not allow you to ${verb} subcontractors.` }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.subcontractors) return { ok: false, error: 'Subcontractor management is not turned on for your company.' }
  return { ok: true, session: session as StaffSession }
}

/**
 * Updates company details and adds any newly selected projects. Existing project associations are append-only
 * history and are never removed here. The company update and the new associations are two writes; if the second
 * fails, the response says exactly what was saved.
 */
export async function updateSubcontractorAction(
  companyId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const projectIdsRaw = formData.getAll('project_ids')
  const values: Record<string, string> = { ...formValues(formData), project_ids: projectIdsRaw.filter((v) => typeof v === 'string').join(',') }
  const gate = await requireSubcontractorManager('edit')
  if (!gate.ok) return { error: gate.error, values }
  const { session } = gate
  if (!isUuid(companyId)) return { error: 'This subcontractor could not be found.', values }

  const parsed = subcontractorSchema.safeParse(values)
  const projectIds = parseProjectIds(projectIdsRaw)
  const contacts = parseContactPersons(values[CONTACT_PERSONS_FIELD])
  const invalid = invalidFormState(parsed, projectIds, contacts, values)
  if (invalid || !parsed.success || !projectIds.ok || !contacts.ok) return invalid ?? { error: 'Please correct the highlighted fields.', values }

  const contactCheck = await precheckContactPersons(await createClient(), session.organizationId, contacts.items)
  if (contactCheck) {
    return 'error' in contactCheck
      ? { error: contactCheck.error as string, values }
      : { error: 'Please correct the highlighted contact persons.', fieldErrors: contactCheck, values }
  }

  const supabase = await createClient()
  const { data: company, error: companyError } = await supabase
    .from('subcontractor_companies')
    .select('id')
    .eq('organization_id', session.organizationId)
    .eq('id', companyId)
    .maybeSingle()
  if (companyError) return { error: friendlyDbError(companyError), values }
  if (!company) return { error: 'This subcontractor could not be found.', values }

  const submitted = projectIds.ok ? projectIds.ids : []
  let toAdd: string[] = []
  if (submitted.length) {
    const { data: existing, error: existingError } = await supabase
      .from('subcontractor_project_assignments')
      .select('project_id')
      .eq('organization_id', session.organizationId)
      .eq('subcontractor_company_id', companyId)
      .is('ended_at', null)
    if (existingError) {
      return isAssignmentSetupError(existingError)
        ? {
            error: 'Project assignment storage is not set up yet, so nothing was saved. Remove the selected projects to save the company details now.',
            values,
          }
        : { error: friendlyDbError(existingError), values }
    }
    toAdd = newProjectIds((existing ?? []).map((r) => r.project_id as string), submitted)
  }

  if (toAdd.length) {
    if (parsed.data.status !== 'active') {
      return {
        error: 'Please correct the highlighted fields.',
        fieldErrors: { project_ids: 'Inactive subcontractors cannot be assigned to new projects. Set the status to Active or remove the new projects.' },
        values,
      }
    }
    const { data: rows, error: lookupError } = await supabase
      .from('projects')
      .select('id, status')
      .eq('organization_id', session.organizationId)
      .in('id', toAdd)
    if (lookupError) return { error: friendlyDbError(lookupError), values }
    const problem = checkSelectedProjects(toAdd, rows ?? [], projectAcceptsNewAssignments)
    if (problem) return { error: 'Please correct the highlighted fields.', fieldErrors: { project_ids: problem }, values }
  }

  const { data: updated, error: updateError } = await supabase
    .from('subcontractor_companies')
    .update(parsed.data)
    .eq('organization_id', session.organizationId)
    .eq('id', companyId)
    .select('id')
  if (updateError) {
    if (updateError.code === '23505') {
      return {
        error: 'Please correct the highlighted fields.',
        fieldErrors: { company_name: 'A subcontractor with this company name already exists' },
        values,
      }
    }
    return { error: `Nothing was saved. ${friendlyDbError(updateError)}`, values }
  }
  if (!updated?.length) return { error: 'Nothing was saved. You do not have permission to edit this subcontractor.', values }

  if (toAdd.length) {
    const { error: insertError } = await supabase.from('subcontractor_project_assignments').insert(
      toAdd.map((project_id) => ({
        organization_id: session.organizationId,
        project_id,
        subcontractor_company_id: companyId,
      })),
    )
    if (insertError) {
      revalidatePath('/subcontractors')
  revalidatePath('/contacts')
      revalidatePath(`/subcontractors/${companyId}`)
      const reason =
        insertError.code === '23505'
          ? ' One of them is already a current project for this subcontractor.'
          : insertError.code === 'P0001' && insertError.message
            ? ` ${insertError.message}.`
            : ''
      return {
        error: `Company details were saved, but the new projects were not added.${reason} Open the subcontractor again to retry.`,
        values,
      }
    }
  }

  const saved = await saveContactPersons(supabase, session, companyId, contacts.items)

  revalidatePath('/subcontractors')
  revalidatePath('/contacts')
  revalidatePath(`/subcontractors/${companyId}`)
  for (const id of saved.personIds) revalidatePath(`/contacts/people/${id}`)
  const warning = saved.problem ? `Company details were saved. ${saved.problem}` : undefined
  if (values[OVERLAY_FIELD] === '1') {
    return { success: `${parsed.data.company_name} was saved.`, savedId: companyId, warning }
  }
  const params = new URLSearchParams({ saved: '1' })
  if (toAdd.length) params.set('projects', String(toAdd.length))
  if (warning) params.set('warning', warning)
  redirect(`/subcontractors/${companyId}?${params.toString()}`)
}

export type EndAssignmentResult = ActionState & { activeWorkConflict?: boolean }

/**
 * Ends one current project assignment. The row is kept as history; scheduled activities, daily logs, and financial
 * records are untouched. When the company still has active scheduled work on the project, the database refuses
 * unless keepActiveWork is explicitly true.
 */
export async function endProjectAssignmentAction(
  companyId: string,
  assignmentId: string,
  input: { reason?: string; keepActiveWork?: boolean },
): Promise<EndAssignmentResult> {
  const gate = await requireSubcontractorManager('manage project assignments for')
  if (!gate.ok) return { error: gate.error }
  if (!isUuid(companyId) || !isUuid(assignmentId)) return { error: 'This project assignment could not be found.' }
  const reason = parseEndReason(input?.reason)
  if (!reason.ok) return { error: reason.error }
  const keepActiveWork = input?.keepActiveWork === true

  const supabase = await createClient()
  const { data: row, error: lookupError } = await supabase
    .from('subcontractor_project_assignments')
    .select('id, ended_at, project:projects(name)')
    .eq('organization_id', gate.session.organizationId)
    .eq('subcontractor_company_id', companyId)
    .eq('id', assignmentId)
    .maybeSingle()
  if (lookupError) {
    return isAssignmentSetupError(lookupError)
      ? { error: 'Project assignment storage is not set up yet. Ask an administrator to apply the database migrations.' }
      : { error: `Nothing was changed. ${friendlyDbError(lookupError)}` }
  }
  if (!row) return { error: 'This project assignment could not be found or you cannot change it.' }
  if (row.ended_at) return { error: 'This project assignment has already ended.' }

  const { error } = await supabase.rpc('end_subcontractor_project_assignment', {
    p_assignment_id: assignmentId,
    p_reason: reason.reason,
    p_keep_active_work: keepActiveWork,
  })
  if (error) {
    if (error.code === 'BJ409') {
      return { error: `Nothing was changed. ${error.message}. Choose how to handle that work first.`, activeWorkConflict: true }
    }
    if (isAssignmentSetupError(error)) {
      return { error: 'Ending assignments needs a database update. Ask an administrator to apply the project assignment history migration.' }
    }
    if (error.code === 'P0001' && error.message) return { error: `Nothing was changed. ${error.message}.` }
    return { error: `Nothing was changed. ${friendlyDbError(error)}` }
  }

  revalidatePath('/subcontractors')
  revalidatePath('/contacts')
  revalidatePath(`/subcontractors/${companyId}`)
  revalidatePath(`/subcontractors/${companyId}/edit`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST
  const name = ((row as any).project?.name as string | undefined) ?? 'the project'
  return { success: `Assignment to ${name} ended. It is kept in Project History.` }
}

/**
 * Activates or deactivates a company. Deactivating only blocks new work: existing schedule assignments and
 * project associations stay exactly as they are, so no contractual commitment is cancelled silently.
 */
export async function setSubcontractorStatusAction(companyId: string, status: 'active' | 'inactive'): Promise<ActionState> {
  const gate = await requireSubcontractorManager(status === 'active' ? 'activate' : 'deactivate')
  if (!gate.ok) return { error: gate.error }
  if (!isUuid(companyId) || (status !== 'active' && status !== 'inactive')) {
    return { error: 'This subcontractor could not be found.' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('subcontractor_companies')
    .update({ status })
    .eq('organization_id', gate.session.organizationId)
    .eq('id', companyId)
    .select('company_name')
  if (error) return { error: `Nothing was changed. ${friendlyDbError(error)}` }
  if (!data?.length) return { error: 'Nothing was changed. This subcontractor could not be found or you cannot edit it.' }
  revalidatePath('/subcontractors')
  revalidatePath('/contacts')
  revalidatePath(`/subcontractors/${companyId}`)
  const name = data[0].company_name as string
  return {
    success: status === 'active' ? `${name} is active and can receive new work.` : `${name} is inactive. Existing assignments were kept.`,
  }
}
