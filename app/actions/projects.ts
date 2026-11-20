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
import { assignPrimaryClient, checkAssignableClient } from '@/lib/project-client-assignment'
import { getStaffMembers } from '@/lib/queries'
import {
  PROJECT_IMPORT_FIELDS,
  RECORD_IMPORT_MAX_ROWS,
  cleanImportRows,
  matchClient,
  normEmail,
  normalizeImportDate,
  normalizeProjectStatus,
  normalizeProjectType,
  projectKey,
  type CheckedImportRow,
  type ClientRef,
  type ImportOutcome,
  type ImportPreview,
  type ImportRowInput,
  type ImportRowResult,
} from '@/lib/record-import'

const uuid = z.uuid()

function toProjectRow<T extends Omit<z.infer<typeof projectSchema>, 'primary_client_id'>>(data: T) {
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
  if (parsed.data.primary_client_id) {
    const clientError = await checkAssignableClient(supabase, session.organizationId, parsed.data.primary_client_id)
    if (clientError) {
      await discardCoverUpload(supabase, cover)
      return { error: 'Please correct the highlighted fields.', fieldErrors: { primary_client_id: clientError }, values }
    }
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
  const templateVersion = values.schedule_setup?.startsWith('tpl:') ? values.schedule_setup.slice(4) : null
  if (features.schedule && templateVersion) {
    // The RPC re-checks that the version is published and visible to this company.
    const applied = uuid.safeParse(templateVersion).success
      ? await supabase.rpc('apply_project_template', { p_project: data.id, p_version: templateVersion })
      : { error: { message: 'invalid template' } }
    if (applied.error) redirect(`/projects/${data.id}/schedule?setup=incomplete`)
    revalidatePath(`/projects/${data.id}`)
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
    .select('cover_image_path, primary_client_id')
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

  // The homeowner is compared against what the form was opened with, so a change made
  // elsewhere in the meantime is reported instead of overwritten.
  const { primary_client_id: requestedClientId, ...projectFields } = parsed.data
  const currentClientId = current.primary_client_id as string | null
  const expectedClientId = 'primary_client_expected' in values ? values.primary_client_expected || null : currentClientId
  // Untouched homeowner field: keep whatever is current rather than reverting a newer change.
  const nextClientId = requestedClientId === expectedClientId ? currentClientId : requestedClientId
  if (requestedClientId !== expectedClientId && currentClientId !== expectedClientId) {
    await discardCoverUpload(supabase, cover)
    return {
      error: 'Someone else changed this project’s homeowner while you were editing. Reload the page to see the current homeowner.',
      fieldErrors: { primary_client_id: 'Changed by someone else' },
      values,
    }
  }
  if (nextClientId && nextClientId !== current.primary_client_id) {
    const clientError = await checkAssignableClient(supabase, session.organizationId, nextClientId)
    if (clientError) {
      await discardCoverUpload(supabase, cover)
      return { error: 'Please correct the highlighted fields.', fieldErrors: { primary_client_id: clientError }, values }
    }
  }

  const previousPath = current.cover_image_path as string | null
  const nextPath = cover.action === 'replace' ? cover.path : cover.action === 'remove' ? null : previousPath
  const coverKind = nextPath && isCoverKind(values.cover_image_kind) ? values.cover_image_kind : null

  const { error } = await supabase
    .from('projects')
    .update({
      ...toProjectRow(projectFields),
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

  const previousClientId = currentClientId
  if (nextClientId !== previousClientId) {
    const link = await assignPrimaryClient(supabase, {
      organizationId: session.organizationId,
      userId: session.userId,
      projectId,
      clientId: nextClientId,
      expectedClientId: previousClientId,
    })
    revalidatePath(`/projects/${projectId}`)
    if (!link.ok) {
      return { error: `Project details were saved, but the homeowner was not changed. ${link.error}`, values }
    }
    revalidatePath('/clients')
    for (const id of [nextClientId, previousClientId]) if (id) revalidatePath(`/clients/${id}`)
  }

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

// ───────── CSV import ─────────

type ProjectImportContext = {
  clients: ClientRef[]
  managers: Map<string, string>
  existingKeys: Set<string>
}

async function loadProjectImportContext(organizationId: string): Promise<ProjectImportContext | { error: string }> {
  const supabase = await createClient()
  const [clients, projects, managers] = await Promise.all([
    supabase.from('clients').select('id, first_name, last_name, email, company_name').eq('organization_id', organizationId).is('archived_at', null).limit(10000),
    supabase.from('projects').select('name, address_line1').eq('organization_id', organizationId).limit(10000),
    getStaffMembers(organizationId, ['org_admin', 'project_manager']),
  ])
  if (clients.error) return { error: friendlyDbError(clients.error) }
  if (projects.error) return { error: friendlyDbError(projects.error) }
  return {
    clients: (clients.data ?? []) as ClientRef[],
    managers: new Map(managers.filter((m) => m.email).map((m) => [normEmail(m.email), m.user_id])),
    existingKeys: new Set((projects.data ?? []).map((p) => projectKey(p.name as string, (p.address_line1 as string) ?? ''))),
  }
}

/** The form values a row maps to, or the problems that stop it. Status and client are resolved here. */
function resolveProjectRow(row: ImportRowInput, ctx: ProjectImportContext) {
  const errors: string[] = []
  const v = row.values

  const status = normalizeProjectStatus(v.status)
  if (status === 'completed') errors.push('Status: import finished jobs as Substantially Complete, then complete them in Trefort')
  else if (!status) errors.push(`Status: "${v.status}" is not a Trefort status`)
  const type = normalizeProjectType(v.project_type)
  if (!type) errors.push('Project Type: use New Custom Home, Renovation, Addition, Remodel or Other')
  const start = normalizeImportDate(v.proposed_start_date)
  if (start === null) errors.push('Start Date: use a date like 2026-09-01 or 9/1/2026')
  const end = normalizeImportDate(v.target_completion_date)
  if (end === null) errors.push('Completion Date: use a date like 2027-06-30 or 6/30/2027')

  let clientId = ''
  const client = matchClient(ctx.clients, v.client_email, v.client_name)
  if (client && 'error' in client) errors.push(client.error)
  else if (client) clientId = client.id

  let managerId = ''
  if (v.project_manager_email) {
    managerId = ctx.managers.get(normEmail(v.project_manager_email)) ?? ''
    if (!managerId) errors.push(`Project Manager Email: ${v.project_manager_email} is not an administrator or project manager here`)
  }

  const formValues = {
    name: v.name,
    primary_client_id: clientId,
    project_type: type ?? 'other',
    description: v.description,
    address_line1: v.address_line1,
    address_line2: v.address_line2,
    city: v.city,
    state: v.state,
    postal_code: v.postal_code,
    lot: v.lot,
    block: v.block,
    phase: '',
    community: v.community,
    legal_description: '',
    estimated_budget: v.estimated_budget,
    proposed_start_date: start ?? '',
    target_completion_date: end ?? '',
    project_manager_id: managerId,
    internal_notes: v.internal_notes,
    planned_business_days: '',
  }
  const parsed = projectSchema.safeParse(formValues)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] === 'estimated_budget' ? 'estimated_budget' : String(issue.path[0])
      const label = PROJECT_IMPORT_FIELDS.find((f) => f.key === key)?.label ?? key
      errors.push(`${label}: ${issue.message}`)
    }
  }
  return { errors, parsed: parsed.success ? parsed.data : null, status: status && status !== 'completed' ? status : null, linked: Boolean(clientId) }
}

function checkProjectImportRows(rows: ImportRowInput[], ctx: ProjectImportContext): CheckedImportRow[] {
  const seen = new Set<string>()
  return rows.map((row) => {
    const { errors, linked } = resolveProjectRow(row, ctx)
    const key = projectKey(row.values.name, row.values.address_line1)
    const skip = ctx.existingKeys.has(key) ? 'A project with this name and address already exists' : seen.has(key) ? 'Same project as an earlier row' : null
    seen.add(key)
    return { ...row, errors, skip, note: !errors.length && !linked ? 'No client linked; you can assign one later' : undefined }
  })
}

export async function previewProjectImportAction(rows: unknown): Promise<ImportPreview> {
  const session = await requireManager()
  const clean = cleanImportRows(PROJECT_IMPORT_FIELDS, rows)
  if (!clean) return { ok: false, error: `Import up to ${RECORD_IMPORT_MAX_ROWS} projects at a time.` }
  const ctx = await loadProjectImportContext(session.organizationId)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  return { ok: true, rows: checkProjectImportRows(clean, ctx) }
}

/**
 * Creates each ready project on its own, with the same validation as the New project form. Imported jobs keep the
 * status from the file (anything but Completed), since they are already under way. Schedules are not created here.
 */
export async function importProjectsAction(rows: unknown): Promise<ImportOutcome> {
  const session = await requireManager()
  const clean = cleanImportRows(PROJECT_IMPORT_FIELDS, rows)
  if (!clean) return { ok: false, error: `Import up to ${RECORD_IMPORT_MAX_ROWS} projects at a time.` }
  const ctx = await loadProjectImportContext(session.organizationId)
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const supabase = await createClient()
  const checked = checkProjectImportRows(clean, ctx)
  const results: ImportRowResult[] = []
  for (const row of checked) {
    if (row.errors.length) {
      results.push({ line: row.line, status: 'failed', message: row.errors.join('; ') })
      continue
    }
    if (row.skip) {
      results.push({ line: row.line, status: 'skipped', message: row.skip })
      continue
    }
    const { parsed, status } = resolveProjectRow(row, ctx)
    if (!parsed || !status) {
      results.push({ line: row.line, status: 'failed', message: 'Could not be checked' })
      continue
    }
    const { data, error } = await supabase
      .from('projects')
      .insert({
        ...toProjectRow(parsed),
        status,
        organization_id: session.organizationId,
        created_by: session.userId,
        updated_by: session.userId,
        project_number: 'pending',
      })
      .select('id')
      .single()
    if (error || !data) results.push({ line: row.line, status: 'failed', message: friendlyDbError(error) })
    else {
      ctx.existingKeys.add(projectKey(row.values.name, row.values.address_line1))
      results.push({ line: row.line, status: 'created', id: data.id, message: row.note })
    }
  }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  return { ok: true, results }
}
