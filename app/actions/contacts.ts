'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession, type StaffSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { OVERLAY_FIELD, fromZodError, formValues, friendlyDbError, type ActionState } from '@/lib/action-state'
import { projectAcceptsNewAssignments } from '@/lib/domain'
import { isUuid } from '@/lib/subcontractor-projects'
import {
  CATEGORY_LABELS,
  IMPORT_MAX_ROWS,
  companySchema,
  isInlinePersonField,
  parseCategory,
  parseProductCategories,
  parseProjectAssignments,
  personName,
  personSchema,
  projectRoleSchema,
  parseStartDate,
  roleSchema,
  validateImportRows,
  validateInlineField,
  type CategoryKey,
  type ImportFieldKey,
  type ImportRow,
  type PendingProjectAssignment,
} from '@/lib/contacts'
import type { CompanyOption } from '@/lib/contacts-data'

type Supabase = Awaited<ReturnType<typeof createClient>>
type Gate = { ok: true; session: StaffSession; supabase: Supabase } | { ok: false; error: string }

async function requireContactsManager(verb = 'manage'): Promise<Gate> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Your session has expired. Please sign in again.' }
  if (!session.organizationId || !session.role || session.role === 'client') {
    return { ok: false, error: 'Your account is not associated with an active construction company.' }
  }
  if (!canManage(session.role)) return { ok: false, error: `Your role does not allow you to ${verb} business contacts.` }
  return { ok: true, session: session as StaffSession, supabase: await createClient() }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function isMissing(error: { code?: string } | null | undefined) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}

function dbError(error: { code?: string; message?: string } | null | undefined) {
  if (isMissing(error)) return 'Business contacts are not set up in this environment yet. Ask an administrator to apply the database migration.'
  return friendlyDbError(error)
}

function revalidateDirectory(...paths: (string | null | undefined)[]) {
  revalidatePath('/contacts')
  for (const p of paths) if (p) revalidatePath(p)
}

const EMAIL_TAKEN = 'Another contact already uses this email'
const COMPANY_TAKEN = 'A company with this name already exists'

// ============ Categories ============

/** Returns category ids for the given names, creating any that do not exist yet (case-insensitive match). */
async function ensureCategories(
  supabase: Supabase,
  organizationId: string,
  kind: 'business' | 'product',
  names: string[],
): Promise<{ ids: string[]; error?: string }> {
  if (!names.length) return { ids: [] }
  const load = async () => {
    const { data, error } = await supabase
      .from('business_categories')
      .select('id, name')
      .eq('organization_id', organizationId)
      .eq('kind', kind)
    return { rows: (data ?? []) as { id: string; name: string }[], error }
  }
  let { rows, error } = await load()
  if (error) return { ids: [], error: dbError(error) }
  const byName = () => new Map(rows.map((r) => [r.name.trim().toLowerCase(), r.id]))
  const missing = names.filter((n) => !byName().has(n.toLowerCase()))
  if (missing.length) {
    const { error: insertError } = await supabase
      .from('business_categories')
      .insert(missing.map((name) => ({ organization_id: organizationId, kind, name })))
    if (insertError && insertError.code !== '23505') return { ids: [], error: dbError(insertError) }
    ;({ rows, error } = await load())
    if (error) return { ids: [], error: dbError(error) }
  }
  const map = byName()
  return { ids: names.map((n) => map.get(n.toLowerCase())).filter((id): id is string => Boolean(id)) }
}

/** Replaces a company's category links with exactly the given business and product categories. */
async function syncCompanyCategories(
  supabase: Supabase,
  organizationId: string,
  companyId: string,
  business: CategoryKey[],
  products: string[],
): Promise<string | null> {
  const [biz, prod] = await Promise.all([
    ensureCategories(supabase, organizationId, 'business', business.map((k) => CATEGORY_LABELS[k])),
    ensureCategories(supabase, organizationId, 'product', products),
  ])
  if (biz.error || prod.error) return biz.error ?? prod.error ?? null
  const wanted = new Set([...biz.ids, ...prod.ids])
  const { data: existing, error } = await supabase
    .from('business_company_categories')
    .select('category_id')
    .eq('organization_id', organizationId)
    .eq('company_id', companyId)
  if (error) return dbError(error)
  const current = new Set((existing ?? []).map((r) => r.category_id as string))
  const toRemove = [...current].filter((id) => !wanted.has(id))
  const toAdd = [...wanted].filter((id) => !current.has(id))
  if (toRemove.length) {
    const { error: delError } = await supabase
      .from('business_company_categories')
      .delete()
      .eq('organization_id', organizationId)
      .eq('company_id', companyId)
      .in('category_id', toRemove)
    if (delError) return dbError(delError)
  }
  if (toAdd.length) {
    const { error: addError } = await supabase
      .from('business_company_categories')
      .insert(toAdd.map((category_id) => ({ organization_id: organizationId, company_id: companyId, category_id })))
    if (addError && addError.code !== '23505') return dbError(addError)
  }
  return null
}

function parseBusinessCategories(formData: FormData): CategoryKey[] {
  return [...new Set(formData.getAll('categories').map((v) => parseCategory(String(v))).filter((k): k is CategoryKey => Boolean(k)))]
}

// ============ People ============

type AssociationPlan = {
  company: { id: string; name: string; role: string | null; isPrimary: boolean; replacePrimary: boolean } | null
  projects: (PendingProjectAssignment & { label: string })[]
}

/**
 * Validates the optional company link and project assignments submitted with the contact form before anything is
 * written, so an invalid choice never leaves a half-saved contact. `personId` is set when editing an existing person.
 */
async function planAssociations(
  gate: Extract<Gate, { ok: true }>,
  values: Record<string, string>,
  personId: string | null,
): Promise<{ plan: AssociationPlan; fieldErrors: Record<string, string> }> {
  const { session, supabase } = gate
  const fieldErrors: Record<string, string> = {}
  const plan: AssociationPlan = { company: null, projects: [] }

  const companyId = (values.company_id ?? '').trim()
  const role = roleSchema.safeParse(values.role)
  if (companyId) {
    if (!isUuid(companyId)) {
      fieldErrors.company_id = 'Choose a company from the list'
    } else if (!role.success) {
      fieldErrors.role = role.error.issues[0]?.message ?? 'Invalid role'
    } else {
      const { data: company, error } = await supabase
        .from('business_companies')
        .select('id, company_name, status')
        .eq('organization_id', session.organizationId)
        .eq('id', companyId)
        .maybeSingle()
      if (error) fieldErrors.company_id = dbError(error)
      else if (!company) fieldErrors.company_id = 'This company could not be found'
      else if (company.status !== 'active') fieldErrors.company_id = 'This company is inactive. Activate it before adding contacts.'
      else {
        const isPrimary = values.is_primary === 'on'
        const replacePrimary = values.replace_primary === 'on'
        if (personId) {
          const { data: existing } = await supabase
            .from('business_person_companies')
            .select('id')
            .eq('organization_id', session.organizationId)
            .eq('person_id', personId)
            .eq('company_id', companyId)
            .eq('status', 'active')
            .limit(1)
          if (existing?.length) fieldErrors.company_id = 'This person is already linked to this company'
        }
        if (isPrimary && !fieldErrors.company_id) {
          const { data: primary } = await supabase
            .from('business_person_companies')
            .select('person_id, person:business_people(first_name, last_name)')
            .eq('organization_id', session.organizationId)
            .eq('company_id', companyId)
            .eq('status', 'active')
            .eq('is_primary_contact', true)
            .maybeSingle()
          if (primary && primary.person_id !== personId && !replacePrimary) {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation typing from PostgREST */
            const current = (primary as any).person ? personName((primary as any).person) : 'Another contact'
            fieldErrors.is_primary = `${current} is already the primary contact. Confirm the replacement or uncheck Primary.`
          }
        }
        plan.company = { id: company.id, name: company.company_name, role: role.data, isPrimary, replacePrimary }
      }
    }
  }

  const assignments = parseProjectAssignments(values.project_assignments)
  if (!assignments.ok) {
    fieldErrors.project_assignments = assignments.error
  } else if (assignments.value.length) {
    const ids = assignments.value.map((a) => a.project_id)
    const [{ data: projects, error }, person, existing] = await Promise.all([
      supabase.from('projects').select('id, name, project_number, status').eq('organization_id', session.organizationId).in('id', ids),
      personId
        ? supabase.from('business_people').select('status').eq('organization_id', session.organizationId).eq('id', personId).maybeSingle()
        : Promise.resolve({ data: null }),
      personId
        ? supabase
            .from('business_person_projects')
            .select('project_id')
            .eq('organization_id', session.organizationId)
            .eq('person_id', personId)
            .eq('status', 'active')
            .in('project_id', ids)
        : Promise.resolve({ data: [] as { project_id: string }[] }),
    ])
    const byId = new Map((projects ?? []).map((p) => [p.id as string, p]))
    const already = new Set((existing.data ?? []).map((r) => r.project_id as string))
    if (error) fieldErrors.project_assignments = dbError(error)
    else if (personId && person.data && person.data.status !== 'active') {
      fieldErrors.project_assignments = 'Inactive contacts cannot be assigned to projects. Activate them first.'
    } else {
      for (const a of assignments.value) {
        const project = byId.get(a.project_id)
        const label = project ? [project.project_number, project.name].filter(Boolean).join(' · ') : 'A project'
        if (!project) fieldErrors.project_assignments = 'One of the selected projects could not be found. Remove it and try again.'
        else if (!projectAcceptsNewAssignments(project.status as string)) fieldErrors.project_assignments = `${label} is not accepting new assignments.`
        else if (already.has(a.project_id)) fieldErrors.project_assignments = `This person is already on ${label}.`
        else plan.projects.push({ ...a, label })
        if (fieldErrors.project_assignments) break
      }
    }
  }
  return { plan, fieldErrors }
}

/**
 * Writes the planned company link and project assignments for a saved person. Projects are inserted in a single
 * statement, so they are saved all together or not at all. Returns plain-language notes for anything not saved.
 */
async function saveAssociations(
  gate: Extract<Gate, { ok: true }>,
  personId: string,
  plan: AssociationPlan,
): Promise<{ problems: string[]; paths: (string | null | undefined)[] }> {
  const { session, supabase } = gate
  const problems: string[] = []
  const paths: (string | null | undefined)[] = []
  if (plan.company) {
    const c = plan.company
    let clearError: { code?: string; message?: string } | null = null
    if (c.isPrimary && c.replacePrimary) {
      ;({ error: clearError } = await supabase
        .from('business_person_companies')
        .update({ is_primary_contact: false, updated_by: session.userId })
        .eq('organization_id', session.organizationId)
        .eq('company_id', c.id)
        .eq('status', 'active')
        .eq('is_primary_contact', true)
        .neq('person_id', personId))
    }
    if (clearError) {
      problems.push(`the link to ${c.name} was not added (${relationshipError(clearError)})`)
    } else {
      const { error } = await supabase.from('business_person_companies').insert({
        organization_id: session.organizationId,
        person_id: personId,
        company_id: c.id,
        position_or_role: c.role,
        is_primary_contact: c.isPrimary,
        created_by: session.userId,
        updated_by: session.userId,
      })
      if (error) problems.push(`the link to ${c.name} was not added (${relationshipError(error)})`)
      paths.push(...(await relationshipPaths(supabase, c.id, personId)))
    }
  }
  if (plan.projects.length) {
    const start = today()
    const { error } = await supabase.from('business_person_projects').insert(
      plan.projects.map((p) => ({
        organization_id: session.organizationId,
        person_id: personId,
        project_id: p.project_id,
        project_role: p.project_role,
        started_at: start,
        created_by: session.userId,
        updated_by: session.userId,
      })),
    )
    if (error) {
      const why = error.code === '23505' ? 'the person is already on one of them' : error.code === 'P0001' ? error.message : dbError(error)
      problems.push(`the project assignments were not added (${why}). Add them from the profile`)
    } else {
      paths.push(...plan.projects.map((p) => `/projects/${p.project_id}`))
    }
  }
  return { problems, paths }
}

/** Overlay callers stay on their page, so they get the result back; full-page forms redirect to the profile. */
function afterSave(personId: string, flag: 'added' | 'saved', problems: string[], overlay: boolean): ActionState {
  const lead = flag === 'added' ? 'Contact saved, but' : 'Changes saved, but'
  const warning = problems.length ? `${lead} ${problems.join('; ')}.` : undefined
  if (overlay) {
    return { savedId: personId, success: flag === 'added' ? 'Contact added.' : 'Changes saved.', warning }
  }
  if (warning) redirect(`/contacts/people/${personId}?warning=${encodeURIComponent(warning)}`)
  redirect(`/contacts/people/${personId}?${flag}=1`)
}

/**
 * Creates a person with an optional company link and optional project assignments. Every choice is validated before
 * the first write; if a later write still fails, the profile explains exactly what was not saved.
 */
export async function createPersonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const gate = await requireContactsManager('add')
  if (!gate.ok) return { error: gate.error, values }
  const { session, supabase } = gate

  const parsed = personSchema.safeParse(values)
  const { plan, fieldErrors: planErrors } = await planAssociations(gate, values, null)
  const fieldErrors: Record<string, string> = { ...(parsed.success ? {} : (fromZodError(parsed.error).fieldErrors ?? {})), ...planErrors }
  if (parsed.success && parsed.data.email) {
    const { data: taken } = await supabase
      .from('business_people')
      .select('id')
      .eq('organization_id', session.organizationId)
      .eq('email', parsed.data.email)
      .limit(1)
    if (taken?.length) fieldErrors.email = EMAIL_TAKEN
  }
  if (!parsed.success || Object.keys(fieldErrors).length) return { error: 'Please correct the highlighted fields. Nothing was saved.', fieldErrors, values }

  const { data: person, error } = await supabase
    .from('business_people')
    .insert({ ...parsed.data, organization_id: session.organizationId, created_by: session.userId, updated_by: session.userId })
    .select('id')
    .single()
  if (error || !person) {
    if (error?.code === '23505') return { error: 'Please correct the highlighted fields.', fieldErrors: { email: EMAIL_TAKEN }, values }
    return { error: `Nothing was saved. ${dbError(error)}`, values }
  }

  const { problems, paths } = await saveAssociations(gate, person.id, plan)
  revalidateDirectory(`/contacts/people/${person.id}`, ...paths)
  return afterSave(person.id, 'added', problems, values[OVERLAY_FIELD] === '1')
}

export type QuickCompanyResult =
  | { ok: true; company: CompanyOption }
  | { ok: false; error: string; existing?: CompanyOption }

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/**
 * Creates a company with just a name and optional business category, for the contact form's inline "Add New Company".
 * Returns the existing record instead when the name is already taken (case-insensitive), so duplicates are never made.
 */
export async function quickCreateCompanyAction(input: { company_name: string; category?: string }): Promise<QuickCompanyResult> {
  const gate = await requireContactsManager('add')
  if (!gate.ok) return { ok: false, error: gate.error }
  const { session, supabase } = gate
  const name = companySchema.shape.company_name.safeParse(input?.company_name ?? '')
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? 'Company name is required' }
  const category = parseCategory(input?.category ?? '')

  const findExisting = async (): Promise<CompanyOption | null> => {
    const { data } = await supabase
      .from('business_companies')
      .select('id, company_name, status')
      .eq('organization_id', session.organizationId)
      .ilike('company_name', escapeLike(name.data))
      .limit(1)
    const row = data?.[0]
    return row ? { id: row.id, company_name: row.company_name, status: row.status, category: null, primary_contact: null } : null
  }
  const duplicate = (existing: CompanyOption): QuickCompanyResult => ({
    ok: false,
    error:
      existing.status === 'active'
        ? `${existing.company_name} already exists. Select it instead.`
        : `${existing.company_name} already exists but is inactive. Activate it from its profile first.`,
    existing: existing.status === 'active' ? existing : undefined,
  })

  const existing = await findExisting()
  if (existing) return duplicate(existing)

  const { data: company, error } = await supabase
    .from('business_companies')
    .insert({ organization_id: session.organizationId, company_name: name.data, created_by: session.userId, updated_by: session.userId })
    .select('id, company_name, status')
    .single()
  if (error || !company) {
    if (error?.code === '23505') {
      const raced = await findExisting()
      if (raced) return duplicate(raced)
      return { ok: false, error: COMPANY_TAKEN }
    }
    return { ok: false, error: `The company was not created. ${dbError(error)}` }
  }
  const catError = category ? await syncCompanyCategories(supabase, session.organizationId, company.id, [category], []) : null
  revalidateDirectory()
  return {
    ok: true,
    company: {
      id: company.id,
      company_name: company.company_name,
      status: company.status,
      category: category && !catError ? CATEGORY_LABELS[category] : null,
      primary_contact: null,
    },
  }
}

/**
 * Saves a person's details and, optionally, adds one more company relationship and new project assignments. Existing
 * relationships and assignments are never removed here; they are managed from the profile.
 */
export async function updatePersonAction(personId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error, values }
  if (!isUuid(personId)) return { error: 'This contact could not be found.', values }
  const parsed = personSchema.safeParse(values)
  const { plan, fieldErrors: planErrors } = await planAssociations(gate, values, personId)
  const fieldErrors: Record<string, string> = { ...(parsed.success ? {} : (fromZodError(parsed.error).fieldErrors ?? {})), ...planErrors }
  if (!parsed.success || Object.keys(fieldErrors).length) return { error: 'Please correct the highlighted fields. Nothing was saved.', fieldErrors, values }

  let query = gate.supabase
    .from('business_people')
    .update({ ...parsed.data, updated_by: gate.session.userId })
    .eq('organization_id', gate.session.organizationId)
    .eq('id', personId)
  if (values.expected_updated_at) query = query.eq('updated_at', values.expected_updated_at)
  const { data, error } = await query.select('id')
  if (error) {
    if (error.code === '23505') return { error: 'Please correct the highlighted fields.', fieldErrors: { email: EMAIL_TAKEN }, values }
    return { error: `Nothing was saved. ${dbError(error)}`, values }
  }
  if (!data?.length) {
    return {
      error: 'Nothing was saved. Someone else changed this contact after you opened it. Reload the page to see their changes, then try again.',
      values,
    }
  }
  const { problems, paths } = await saveAssociations(gate, personId, plan)
  revalidateDirectory(`/contacts/people/${personId}`, ...paths)
  return afterSave(personId, 'saved', problems, values[OVERLAY_FIELD] === '1')
}

export type InlineEditResult = { ok: true; value: string | null; updated_at: string } | { ok: false; error: string; stale?: boolean }

/** Saves one directory cell. Uses the row's updated_at as an optimistic lock so concurrent edits are never overwritten. */
export async function updatePersonFieldAction(
  personId: string,
  field: string,
  rawValue: string,
  expectedUpdatedAt: string,
): Promise<InlineEditResult> {
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!isUuid(personId) || !isInlinePersonField(field)) return { ok: false, error: 'This field cannot be edited here.' }
  const valid = validateInlineField(field, rawValue)
  if (!valid.ok) return { ok: false, error: valid.error }

  const { data, error } = await gate.supabase
    .from('business_people')
    .update({ [field]: valid.value, updated_by: gate.session.userId })
    .eq('organization_id', gate.session.organizationId)
    .eq('id', personId)
    .eq('updated_at', expectedUpdatedAt)
    .select('updated_at')
  if (error) return { ok: false, error: error.code === '23505' ? EMAIL_TAKEN : dbError(error) }
  if (!data?.length) {
    return { ok: false, stale: true, error: 'This contact was changed by someone else. Reload to see the latest details.' }
  }
  revalidateDirectory(`/contacts/people/${personId}`)
  return { ok: true, value: valid.value, updated_at: data[0].updated_at as string }
}

// ============ Status ============

type StatusTable = 'business_people' | 'business_companies'

async function setStatus(table: StatusTable, ids: string[], status: 'active' | 'inactive'): Promise<ActionState & { count?: number }> {
  const gate = await requireContactsManager(status === 'active' ? 'activate' : 'deactivate')
  if (!gate.ok) return { error: gate.error }
  const clean = [...new Set(ids)].filter(isUuid).slice(0, 500)
  if (!clean.length || (status !== 'active' && status !== 'inactive')) return { error: 'Nothing was changed. No valid records were selected.' }
  if (table === 'business_companies') {
    const { data: linked } = await gate.supabase
      .from('business_companies')
      .select('id')
      .eq('organization_id', gate.session.organizationId)
      .in('id', clean)
      .not('subcontractor_company_id', 'is', null)
    if (linked?.length) {
      return { error: 'Nothing was changed. Subcontractor companies are activated or deactivated from their Subcontractor page.' }
    }
  }
  const { data, error } = await gate.supabase
    .from(table)
    .update({ status, updated_by: gate.session.userId })
    .eq('organization_id', gate.session.organizationId)
    .in('id', clean)
    .select('id')
  if (error) return { error: `Nothing was changed. ${dbError(error)}` }
  if (!data?.length) return { error: 'Nothing was changed. These records could not be found or you cannot edit them.' }
  revalidateDirectory(...clean.map((id) => `/contacts/${table === 'business_people' ? 'people' : 'companies'}/${id}`))
  return { count: data.length }
}

/**
 * When deactivating, `endProjects` records the explicit decision to end the person's active project responsibilities.
 * Ended associations stay in the project history.
 */
export async function setPersonStatusAction(
  personId: string,
  status: 'active' | 'inactive',
  options?: { endProjects?: boolean },
): Promise<ActionState> {
  const r = await setStatus('business_people', [personId], status)
  if (r.error) return r
  if (status === 'inactive' && options?.endProjects) {
    const gate = await requireContactsManager('deactivate')
    if (gate.ok) {
      const { data, error } = await gate.supabase
        .from('business_person_projects')
        .update({ status: 'ended', ended_at: today(), updated_by: gate.session.userId })
        .eq('organization_id', gate.session.organizationId)
        .eq('person_id', personId)
        .eq('status', 'active')
        .select('project_id')
      if (error) return { error: `Contact deactivated, but project associations were not ended. ${dbError(error)}` }
      for (const row of data ?? []) revalidatePath(`/projects/${row.project_id}`)
      if (data?.length) {
        return { success: `Contact deactivated and ${data.length} project ${data.length === 1 ? 'association' : 'associations'} ended. History was kept.` }
      }
    }
  }
  return {
    success: status === 'active' ? 'Contact is active again.' : 'Contact deactivated. Existing relationships and history were kept.',
  }
}

export async function setCompanyStatusAction(companyId: string, status: 'active' | 'inactive'): Promise<ActionState> {
  const r = await setStatus('business_companies', [companyId], status)
  if (r.error) return r
  return {
    success: status === 'active' ? 'Company is active again.' : 'Company deactivated. Existing contacts and history were kept.',
  }
}

export async function setStatusBulkAction(
  kind: 'person' | 'company',
  ids: string[],
  status: 'active' | 'inactive',
): Promise<ActionState> {
  if (!Array.isArray(ids)) return { error: 'Nothing was changed.' }
  const r = await setStatus(kind === 'person' ? 'business_people' : 'business_companies', ids, status)
  if (r.error) return r
  const noun = kind === 'person' ? (r.count === 1 ? 'contact' : 'contacts') : r.count === 1 ? 'company' : 'companies'
  return { success: `${r.count} ${noun} ${status === 'active' ? 'activated' : 'deactivated'}.` }
}

// ============ Companies ============

/**
 * Case-insensitive name match against the directory and the subcontractor list. A subcontractor that has no directory
 * record yet still counts, so its canonical company is reused instead of creating an unlinked duplicate.
 */
async function findDuplicateCompany(gate: Extract<Gate, { ok: true }>, name: string): Promise<NonNullable<ActionState['duplicate']> | null> {
  const { supabase, session } = gate
  const pattern = escapeLike(name.trim())
  const [directory, subcontractors] = await Promise.all([
    supabase
      .from('business_companies')
      .select('id, company_name, status, subcontractor_company_id')
      .eq('organization_id', session.organizationId)
      .ilike('company_name', pattern)
      .limit(1),
    supabase.from('subcontractor_companies').select('id, company_name').eq('organization_id', session.organizationId).ilike('company_name', pattern).limit(1),
  ])
  const row = directory.data?.[0] as { id: string; company_name: string; status: string; subcontractor_company_id: string | null } | undefined
  if (row) {
    return {
      id: row.id,
      name: row.company_name,
      href: `/contacts/companies/${row.id}`,
      kind: row.subcontractor_company_id ? 'subcontractor' : 'company',
      inactive: row.status !== 'active',
    }
  }
  const sub = subcontractors.data?.[0] as { id: string; company_name: string } | undefined
  return sub ? { id: sub.id, name: sub.company_name, href: `/subcontractors/${sub.id}`, kind: 'subcontractor' } : null
}

export async function createCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values: Record<string, string> = { ...formValues(formData), categories: formData.getAll('categories').join(',') }
  const gate = await requireContactsManager('add')
  if (!gate.ok) return { error: gate.error, values }
  const { session, supabase } = gate
  const parsed = companySchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const overlay = values[OVERLAY_FIELD] === '1'

  const duplicateResult = async (): Promise<ActionState | null> => {
    const duplicate = await findDuplicateCompany(gate, parsed.data.company_name)
    if (!duplicate) return null
    const message =
      duplicate.kind === 'subcontractor'
        ? `${duplicate.name} is already a subcontractor. Open it instead of creating a separate company.`
        : duplicate.inactive
          ? `${duplicate.name} already exists but is inactive. Open it to reactivate it.`
          : `${duplicate.name} is already in your directory.`
    return { error: 'This company already exists. Nothing was saved.', fieldErrors: { company_name: message }, values, duplicate }
  }

  const blocked = await duplicateResult()
  if (blocked) return blocked

  const { data: company, error } = await supabase
    .from('business_companies')
    .insert({ ...parsed.data, organization_id: session.organizationId, created_by: session.userId, updated_by: session.userId })
    .select('id')
    .single()
  if (error || !company) {
    if (error?.code === '23505') {
      return (await duplicateResult()) ?? { error: 'Please correct the highlighted fields.', fieldErrors: { company_name: COMPANY_TAKEN }, values }
    }
    return { error: `Nothing was saved. ${dbError(error)}`, values }
  }
  const catError = await syncCompanyCategories(
    supabase,
    session.organizationId,
    company.id,
    parseBusinessCategories(formData),
    parseProductCategories(values.product_categories),
  )
  revalidateDirectory()
  if (overlay) {
    return { savedId: company.id, success: 'Company added.', warning: catError ? `Company saved, but categories were not. ${catError}` : undefined }
  }
  if (catError) redirect(`/contacts/companies/${company.id}?warning=${encodeURIComponent(`Company saved, but categories were not. ${catError}`)}`)
  redirect(`/contacts/companies/${company.id}?added=1`)
}

/**
 * Updates a company and its categories. Subcontractor-linked companies keep their name, email, and phone in sync with
 * the subcontractor record, so only notes and categories are editable here.
 */
export async function updateCompanyAction(companyId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values: Record<string, string> = { ...formValues(formData), categories: formData.getAll('categories').join(',') }
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error, values }
  const { session, supabase } = gate
  if (!isUuid(companyId)) return { error: 'This company could not be found.', values }

  const { data: existing, error: lookupError } = await supabase
    .from('business_companies')
    .select('id, company_name, company_email, company_phone, subcontractor_company_id')
    .eq('organization_id', session.organizationId)
    .eq('id', companyId)
    .maybeSingle()
  if (lookupError) return { error: dbError(lookupError), values }
  if (!existing) return { error: 'This company could not be found.', values }

  const linked = Boolean(existing.subcontractor_company_id)
  const parsed = companySchema.safeParse(
    linked
      ? { ...values, company_name: existing.company_name, company_email: existing.company_email ?? '', company_phone: existing.company_phone ?? '' }
      : values,
  )
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- identity fields of linked companies are owned by the subcontractor record
  const { company_name, company_email, company_phone, ...editableWhenLinked } = parsed.data
  const { data, error } = await supabase
    .from('business_companies')
    .update({ ...(linked ? editableWhenLinked : parsed.data), updated_by: session.userId })
    .eq('organization_id', session.organizationId)
    .eq('id', companyId)
    .select('id')
  if (error) {
    if (error.code === '23505') return { error: 'Please correct the highlighted fields.', fieldErrors: { company_name: COMPANY_TAKEN }, values }
    return { error: `Nothing was saved. ${dbError(error)}`, values }
  }
  if (!data?.length) return { error: 'Nothing was saved. You do not have permission to edit this company.', values }

  const catError = await syncCompanyCategories(
    supabase,
    session.organizationId,
    companyId,
    parseBusinessCategories(formData),
    parseProductCategories(values.product_categories),
  )
  revalidateDirectory(`/contacts/companies/${companyId}`)
  if (catError) return { error: `Company details were saved, but categories were not. ${catError}`, values }
  redirect(`/contacts/companies/${companyId}?saved=1`)
}

// ============ Person ↔ company relationships ============

type CompanyTarget = { companyId: string } | { subcontractorId: string }

/** Resolves a directory company id, creating the linked directory record for a subcontractor on first use. */
async function resolveCompany(gate: Extract<Gate, { ok: true }>, target: CompanyTarget): Promise<{ id: string } | { error: string }> {
  if ('companyId' in target) {
    if (!isUuid(target.companyId)) return { error: 'This company could not be found.' }
    return { id: target.companyId }
  }
  if (!isUuid(target.subcontractorId)) return { error: 'This subcontractor could not be found.' }
  const features = await getOrgFeatures(gate.session.organizationId)
  if (!features.subcontractors) return { error: 'Subcontractor management is not turned on for your company.' }
  const { data, error } = await gate.supabase.rpc('link_subcontractor_company', { p_subcontractor: target.subcontractorId })
  if (error || !data) {
    if (error?.code === 'P0001' && error.message) return { error: `${error.message}.` }
    return { error: dbError(error) }
  }
  return { id: data as string }
}

function companyPaths(target: CompanyTarget, companyId: string) {
  return 'subcontractorId' in target
    ? [`/contacts/companies/${companyId}`, `/subcontractors/${target.subcontractorId}`, `/subcontractors/${target.subcontractorId}/edit`]
    : [`/contacts/companies/${companyId}`]
}

function relationshipError(error: { code?: string; message?: string }): string {
  if (error.code === '23505') {
    return error.message?.includes('primary')
      ? 'This company already has a primary contact. Clear it first or leave Primary unchecked.'
      : 'This person already has an active relationship with this company.'
  }
  if (error.code === 'P0001' && error.message) return `${error.message}.`
  return dbError(error)
}

/**
 * Adds a contact person to a company (or subcontractor). Either links an existing person (person_id) or creates a new
 * one from the submitted fields. Never merges people by name.
 */
export async function addCompanyContactAction(target: CompanyTarget, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const gate = await requireContactsManager('add')
  if (!gate.ok) return { error: gate.error, values }
  const { session, supabase } = gate

  const role = roleSchema.safeParse(values.role)
  if (!role.success) return { error: 'Please correct the highlighted fields.', fieldErrors: { role: role.error.issues[0]?.message ?? '' }, values }
  const existingPerson = values.mode === 'existing' ? values.person_id : null
  let parsedPerson: ReturnType<typeof personSchema.safeParse> | null = null
  if (existingPerson !== null) {
    if (!isUuid(existingPerson)) return { error: 'Please correct the highlighted fields.', fieldErrors: { person_id: 'Choose a contact' }, values }
  } else {
    parsedPerson = personSchema.safeParse(values)
    if (!parsedPerson.success) return { ...fromZodError(parsedPerson.error), values }
  }

  const company = await resolveCompany(gate, target)
  if ('error' in company) return { error: `Nothing was saved. ${company.error}`, values }

  let personId = existingPerson
  if (!personId && parsedPerson?.success) {
    const { data: created, error } = await supabase
      .from('business_people')
      .insert({ ...parsedPerson.data, organization_id: session.organizationId, created_by: session.userId, updated_by: session.userId })
      .select('id')
      .single()
    if (error || !created) {
      if (error?.code === '23505') {
        return {
          error: 'Please correct the highlighted fields.',
          fieldErrors: { email: `${EMAIL_TAKEN}. Use "Existing contact" to link them instead.` },
          values,
        }
      }
      return { error: `Nothing was saved. ${dbError(error)}`, values }
    }
    personId = created.id
  }

  const { error: relError } = await supabase.from('business_person_companies').insert({
    organization_id: session.organizationId,
    person_id: personId,
    company_id: company.id,
    position_or_role: role.data,
    is_primary_contact: values.is_primary === 'on',
    created_by: session.userId,
    updated_by: session.userId,
  })
  revalidateDirectory(...companyPaths(target, company.id), personId ? `/contacts/people/${personId}` : null)
  if (relError) {
    const prefix = existingPerson ? 'Nothing was saved.' : 'The contact was created, but was not linked to this company.'
    return { error: `${prefix} ${relationshipError(relError)}`, values: existingPerson ? values : {} }
  }
  return { success: existingPerson ? 'Contact linked to this company.' : 'Contact added to this company.' }
}

export async function addPersonCompanyAction(personId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error, values }
  if (!isUuid(personId)) return { error: 'This contact could not be found.', values }
  if (!isUuid(values.company_id ?? '')) return { error: 'Please correct the highlighted fields.', fieldErrors: { company_id: 'Choose a company' }, values }
  const role = roleSchema.safeParse(values.role)
  if (!role.success) return { error: 'Please correct the highlighted fields.', fieldErrors: { role: role.error.issues[0]?.message ?? '' }, values }

  const { error } = await gate.supabase.from('business_person_companies').insert({
    organization_id: gate.session.organizationId,
    person_id: personId,
    company_id: values.company_id,
    position_or_role: role.data,
    is_primary_contact: values.is_primary === 'on',
    created_by: gate.session.userId,
    updated_by: gate.session.userId,
  })
  if (error) return { error: `Nothing was saved. ${relationshipError(error)}`, values }
  revalidateDirectory(`/contacts/people/${personId}`, `/contacts/companies/${values.company_id}`)
  return { success: 'Company relationship added.' }
}

async function relationshipPaths(supabase: Supabase, companyId: string, personId: string) {
  const { data } = await supabase.from('business_companies').select('subcontractor_company_id').eq('id', companyId).maybeSingle()
  const sub = data?.subcontractor_company_id as string | null | undefined
  return [`/contacts/people/${personId}`, `/contacts/companies/${companyId}`, sub && `/subcontractors/${sub}`, sub && `/subcontractors/${sub}/edit`]
}

/** Ends a person–company relationship. The row is kept as history; project associations made through it are untouched. */
export async function endRelationshipAction(relationshipId: string): Promise<ActionState> {
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error }
  if (!isUuid(relationshipId)) return { error: 'This relationship could not be found.' }
  const { data, error } = await gate.supabase
    .from('business_person_companies')
    .update({ status: 'ended', ended_at: today(), updated_by: gate.session.userId })
    .eq('organization_id', gate.session.organizationId)
    .eq('id', relationshipId)
    .eq('status', 'active')
    .select('person_id, company_id')
  if (error) return { error: `Nothing was changed. ${relationshipError(error)}` }
  if (!data?.length) return { error: 'Nothing was changed. This relationship has already ended or could not be found.' }
  revalidateDirectory(...(await relationshipPaths(gate.supabase, data[0].company_id, data[0].person_id)))
  return { success: 'Relationship ended. It is kept in the history.' }
}

/** Makes one active relationship the company's primary contact, clearing any previous primary first. */
export async function setPrimaryContactAction(relationshipId: string): Promise<ActionState> {
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error }
  if (!isUuid(relationshipId)) return { error: 'This relationship could not be found.' }
  const { session, supabase } = gate
  const { data: rel } = await supabase
    .from('business_person_companies')
    .select('id, person_id, company_id, status, is_primary_contact')
    .eq('organization_id', session.organizationId)
    .eq('id', relationshipId)
    .maybeSingle()
  if (!rel || rel.status !== 'active') return { error: 'Only a current contact can be made primary.' }
  if (rel.is_primary_contact) return { success: 'Already the primary contact.' }
  const { error: clearError } = await supabase
    .from('business_person_companies')
    .update({ is_primary_contact: false, updated_by: session.userId })
    .eq('organization_id', session.organizationId)
    .eq('company_id', rel.company_id)
    .eq('status', 'active')
    .eq('is_primary_contact', true)
  if (clearError) return { error: `Nothing was changed. ${relationshipError(clearError)}` }
  const { error } = await supabase
    .from('business_person_companies')
    .update({ is_primary_contact: true, updated_by: session.userId })
    .eq('organization_id', session.organizationId)
    .eq('id', relationshipId)
  revalidateDirectory(...(await relationshipPaths(supabase, rel.company_id, rel.person_id)))
  if (error) return { error: `The previous primary contact was cleared, but this one was not set. ${relationshipError(error)}` }
  return { success: 'Primary contact updated.' }
}

// ============ Project associations ============

export async function addPersonProjectAction(personId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error, values }
  const { session, supabase } = gate
  if (!isUuid(personId)) return { error: 'This contact could not be found.', values }
  const fieldErrors: Record<string, string> = {}
  if (!isUuid(values.project_id ?? '')) fieldErrors.project_id = 'Choose a project'
  const role = projectRoleSchema.safeParse(values.project_role)
  if (!role.success) fieldErrors.project_role = role.error.issues[0]?.message ?? 'Project role is required'
  const via = values.person_company_id ? values.person_company_id : null
  if (via && !isUuid(via)) fieldErrors.person_company_id = 'Choose a company relationship'
  const start = parseStartDate(values.started_at, today())
  if (!start.ok) fieldErrors.started_at = start.error
  if (Object.keys(fieldErrors).length || !role.success || !start.ok) return { error: 'Please correct the highlighted fields.', fieldErrors, values }

  const { data: person } = await supabase
    .from('business_people')
    .select('status')
    .eq('organization_id', session.organizationId)
    .eq('id', personId)
    .maybeSingle()
  if (!person) return { error: 'This contact could not be found.', values }
  if (person.status !== 'active') return { error: 'Nothing was saved. Inactive contacts cannot be assigned to projects. Activate them first.', values }

  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('organization_id', session.organizationId)
    .eq('id', values.project_id)
    .maybeSingle()
  if (!project) return { error: 'Please correct the highlighted fields.', fieldErrors: { project_id: 'This project could not be found' }, values }
  if (!projectAcceptsNewAssignments(project.status as string)) {
    return { error: 'Please correct the highlighted fields.', fieldErrors: { project_id: 'This project is not accepting new assignments' }, values }
  }

  const { error } = await supabase.from('business_person_projects').insert({
    organization_id: session.organizationId,
    person_id: personId,
    project_id: values.project_id,
    person_company_id: via,
    project_role: role.data,
    started_at: start.value,
    created_by: session.userId,
    updated_by: session.userId,
  })
  if (error) {
    const why =
      error.code === '23505' ? 'This person is already on that project.' : error.code === 'P0001' ? `${error.message}.` : dbError(error)
    return { error: `Nothing was saved. ${why}`, values }
  }
  revalidateDirectory(`/contacts/people/${personId}`, `/projects/${values.project_id}`)
  return { success: 'Project association added.' }
}

export async function endPersonProjectAction(associationId: string): Promise<ActionState> {
  const gate = await requireContactsManager('edit')
  if (!gate.ok) return { error: gate.error }
  if (!isUuid(associationId)) return { error: 'This project association could not be found.' }
  const { data, error } = await gate.supabase
    .from('business_person_projects')
    .update({ status: 'ended', ended_at: today(), updated_by: gate.session.userId })
    .eq('organization_id', gate.session.organizationId)
    .eq('id', associationId)
    .eq('status', 'active')
    .select('person_id, project_id')
  if (error) return { error: `Nothing was changed. ${error.code === 'P0001' ? `${error.message}.` : dbError(error)}` }
  if (!data?.length) return { error: 'Nothing was changed. This association has already ended or could not be found.' }
  revalidateDirectory(`/contacts/people/${data[0].person_id}`, `/projects/${data[0].project_id}`)
  return { success: 'Project association ended. It is kept in the history.' }
}

/**
 * Assigns a directory contact to a project from the project page. Either picks an existing active person or creates a
 * new one first. Assigning a company never auto-assigns its people; each person is added explicitly here.
 */
export async function assignProjectContactAction(projectId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const gate = await requireContactsManager('assign')
  if (!gate.ok) return { error: gate.error, values }
  const { session, supabase } = gate
  if (!isUuid(projectId)) return { error: 'This project could not be found.', values }

  const mode = values.mode === 'new' ? 'new' : 'existing'
  const fieldErrors: Record<string, string> = {}
  const role = projectRoleSchema.safeParse(values.project_role)
  if (!role.success) fieldErrors.project_role = role.error.issues[0]?.message ?? 'Project role is required'
  const via = mode === 'existing' && values.person_company_id ? values.person_company_id : null
  if (via && !isUuid(via)) fieldErrors.person_company_id = 'Choose a company relationship'
  if (mode === 'existing' && !isUuid(values.person_id ?? '')) fieldErrors.person_id = 'Choose a contact'
  const person = mode === 'new' ? personSchema.safeParse(values) : null
  if (person && !person.success) Object.assign(fieldErrors, fromZodError(person.error).fieldErrors ?? {})
  const start = parseStartDate(values.started_at, today())
  if (!start.ok) fieldErrors.started_at = start.error
  if (Object.keys(fieldErrors).length || !role.success || !start.ok) return { error: 'Please correct the highlighted fields.', fieldErrors, values }

  if (mode === 'existing') {
    const { data: existingPerson } = await supabase
      .from('business_people')
      .select('status')
      .eq('organization_id', session.organizationId)
      .eq('id', values.person_id)
      .maybeSingle()
    if (!existingPerson) return { error: 'Please correct the highlighted fields.', fieldErrors: { person_id: 'This contact could not be found' }, values }
    if (existingPerson.status !== 'active') {
      return { error: 'Nothing was saved. Inactive contacts cannot be assigned to projects. Activate them first.', values }
    }
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('organization_id', session.organizationId)
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return { error: 'This project could not be found.', values }
  if (!projectAcceptsNewAssignments(project.status as string)) return { error: 'This project is not accepting new assignments.', values }

  let personId = values.person_id
  if (mode === 'new' && person?.success) {
    const { data: created, error } = await supabase
      .from('business_people')
      .insert({ ...person.data, organization_id: session.organizationId, created_by: session.userId, updated_by: session.userId })
      .select('id')
      .single()
    if (error || !created) {
      if (error?.code === '23505') return { error: 'Please correct the highlighted fields.', fieldErrors: { email: EMAIL_TAKEN }, values }
      return { error: `Nothing was saved. ${dbError(error)}`, values }
    }
    personId = created.id
  }

  const { error } = await supabase.from('business_person_projects').insert({
    organization_id: session.organizationId,
    person_id: personId,
    project_id: projectId,
    person_company_id: via,
    project_role: role.data,
    started_at: start.value,
    created_by: session.userId,
    updated_by: session.userId,
  })
  if (error) {
    const why =
      error.code === '23505' ? 'This person is already on this project.' : error.code === 'P0001' ? `${error.message}.` : dbError(error)
    revalidateDirectory(`/projects/${projectId}`)
    return { error: mode === 'new' ? `Contact created, but not assigned. ${why}` : `Nothing was saved. ${why}`, values }
  }
  revalidateDirectory(`/contacts/people/${personId}`, `/projects/${projectId}`)
  return { success: mode === 'new' ? 'Contact created and assigned to this project.' : 'Contact assigned to this project.' }
}

// ============ Import ============

export type ImportPreviewResult = { ok: true; existingEmails: string[] } | { ok: false; error: string }

/** Returns which of the given emails already belong to a contact in this organization. */
export async function checkImportEmailsAction(emails: string[]): Promise<ImportPreviewResult> {
  const gate = await requireContactsManager('import')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!Array.isArray(emails)) return { ok: false, error: 'Invalid request.' }
  const clean = [...new Set(emails.filter((e) => typeof e === 'string').map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, IMPORT_MAX_ROWS)
  if (!clean.length) return { ok: true, existingEmails: [] }
  const found = new Set<string>()
  for (let i = 0; i < clean.length; i += 200) {
    const { data, error } = await gate.supabase
      .from('business_people')
      .select('email')
      .eq('organization_id', gate.session.organizationId)
      .in('email', clean.slice(i, i + 200))
    if (error) return { ok: false, error: dbError(error) }
    for (const r of data ?? []) if (r.email) found.add((r.email as string).toLowerCase())
  }
  return { ok: true, existingEmails: [...found] }
}

export type ImportRowResult = { line: number; status: 'created' | 'skipped' | 'failed'; message?: string; personId?: string }
export type ImportResult = { ok: true; results: ImportRowResult[] } | { ok: false; error: string }

/**
 * Imports validated rows one by one so a single bad row never blocks the rest. Rows whose email already exists are
 * skipped (never merged), which makes retrying a partially failed import safe.
 */
export async function importContactsAction(rows: { line: number; values: Record<ImportFieldKey, string> }[]): Promise<ImportResult> {
  const gate = await requireContactsManager('import')
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!Array.isArray(rows) || rows.length > IMPORT_MAX_ROWS) return { ok: false, error: `Import up to ${IMPORT_MAX_ROWS} rows at a time.` }
  const { session, supabase } = gate

  const emailCheck = await checkImportEmailsAction(rows.map((r) => r.values?.email ?? ''))
  if (!emailCheck.ok) return { ok: false, error: emailCheck.error }
  const validated: ImportRow[] = validateImportRows(
    rows.map((r) => ({ line: Number(r.line) || 0, values: r.values, errors: [], duplicate: null })),
    new Set(emailCheck.existingEmails),
  )

  const companyIds = new Map<string, string>()
  const { data: companies } = await supabase.from('business_companies').select('id, company_name').eq('organization_id', session.organizationId)
  for (const c of companies ?? []) companyIds.set((c.company_name as string).trim().toLowerCase(), c.id as string)

  const results: ImportRowResult[] = []
  for (const row of validated) {
    if (row.errors.length) {
      results.push({ line: row.line, status: 'failed', message: row.errors.join('; ') })
      continue
    }
    if (row.duplicate) {
      results.push({ line: row.line, status: 'skipped', message: row.duplicate === 'existing' ? 'Email already exists' : 'Duplicate email in file' })
      continue
    }
    const person = personSchema.parse(row.values)
    const { data: created, error } = await supabase
      .from('business_people')
      .insert({ ...person, organization_id: session.organizationId, created_by: session.userId, updated_by: session.userId })
      .select('id')
      .single()
    if (error || !created) {
      results.push({
        line: row.line,
        status: error?.code === '23505' ? 'skipped' : 'failed',
        message: error?.code === '23505' ? 'Email already exists' : dbError(error),
      })
      continue
    }

    const companyName = row.values.company_name.trim()
    if (companyName) {
      let companyId = companyIds.get(companyName.toLowerCase())
      if (!companyId) {
        const { data: newCompany, error: companyError } = await supabase
          .from('business_companies')
          .insert({ organization_id: session.organizationId, company_name: companyName, created_by: session.userId, updated_by: session.userId })
          .select('id')
          .single()
        if (newCompany) {
          companyId = newCompany.id as string
          companyIds.set(companyName.toLowerCase(), companyId)
        } else {
          results.push({ line: row.line, status: 'created', personId: created.id, message: `Company not created: ${dbError(companyError)}` })
          continue
        }
      }
      const { error: relError } = await supabase.from('business_person_companies').insert({
        organization_id: session.organizationId,
        person_id: created.id,
        company_id: companyId,
        position_or_role: row.values.role || null,
        created_by: session.userId,
        updated_by: session.userId,
      })
      if (relError) {
        results.push({ line: row.line, status: 'created', personId: created.id, message: `Not linked to company: ${relationshipError(relError)}` })
        continue
      }
    }
    results.push({ line: row.line, status: 'created', personId: created.id })
  }

  revalidateDirectory()
  return { ok: true, results }
}
