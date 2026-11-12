'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession, requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { parseSignedDollarsToCents } from '@/lib/financials'
import { changeOrderPath } from '@/lib/change-orders'
import {
  NOTE_REQUIRED_ACTIONS,
  SELECTIONS_BUCKET,
  SELECTION_ACTIONS,
  SELECTION_FILE_MAX_BYTES,
  SELECTION_PHOTO_TYPES,
  SELECTION_SPEC_TYPES,
  portalSelectionPath,
  selectionPath,
  selectionsPath,
} from '@/lib/selections'
import { MAX_SELECTIONS_PER_BATCH, validateDraft, type DraftErrors, type SelectionDraft, type ValidDraft } from '@/lib/selection-drafts'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .optional()
    .transform((v) => (v ? v : null))

const money = (required: boolean) =>
  z
    .string()
    .trim()
    .optional()
    .transform((v, ctx) => {
      if (!v) {
        if (required) {
          ctx.addIssue({ code: 'custom', message: 'Enter a price' })
          return z.NEVER
        }
        return null
      }
      const cents = parseSignedDollarsToCents(v)
      if (cents === null || cents < 0) {
        ctx.addIssue({ code: 'custom', message: 'Enter a dollar amount of zero or more' })
        return z.NEVER
      }
      return cents
    })

const isStale = (message?: string) => /STALE|refresh/i.test(message ?? '')

function revalidateSelection(projectId: string, id?: string) {
  revalidatePath(selectionsPath(projectId))
  if (id) {
    revalidatePath(selectionPath(projectId, id))
    revalidatePath(portalSelectionPath(id))
  }
  revalidatePath('/portal/selections')
}

async function requireSelectionsAccess() {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'estimates')
  return session
}

// ---------------------------------------------------------------------------
// Selection header
// ---------------------------------------------------------------------------

const selectionSchema = z.object({
  project_id: z.uuid('Missing project'),
  id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  expected_version: z.coerce.number().int().positive().optional(),
  name: z.string().trim().min(2, 'Enter a name').max(160),
  category: z.string().trim().min(2, 'Choose or enter a category').max(60),
  location: optionalText(160),
  description: optionalText(4000),
  notes: optionalText(4000),
  internal_notes: optionalText(4000),
  cost_code: optionalText(40),
  allowance: money(false),
  due_date: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date')
    .transform((v) => (v ? v : null)),
})

export async function saveSelectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const session = await requireSelectionsAccess()
  const parsed = selectionSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const d = parsed.data
  const supabase = await createClient()

  const content = {
    name: d.name,
    category: d.category,
    location: d.location,
    description: d.description,
    notes: d.notes,
    internal_notes: d.internal_notes,
    cost_code: d.cost_code,
    allowance_cents: d.allowance,
    due_date: d.due_date,
  }

  // Remember categories so the picker offers them next time; duplicates are ignored by the unique index.
  await supabase.from('selection_categories').insert({ organization_id: session.organizationId, name: d.category }).then(
    () => undefined,
    () => undefined,
  )

  if (!d.id) {
    const { data, error } = await supabase
      .from('selections')
      .insert({ ...content, organization_id: session.organizationId, project_id: d.project_id })
      .select('id')
      .single()
    if (error || !data) return { error: friendlyDbError(error), values }
    revalidateSelection(d.project_id, data.id)
    redirect(selectionPath(d.project_id, data.id))
  }

  let query = supabase.from('selections').update(content).eq('id', d.id).eq('project_id', d.project_id)
  if (d.expected_version) query = query.eq('version', d.expected_version)
  const { data, error } = await query.select('id')
  if (error) return { error: friendlyDbError(error), values, conflict: isStale(error.message) }
  if (!data || data.length === 0) {
    return { error: 'This selection changed since you opened it. Refresh to see the latest version.', values, conflict: true }
  }
  revalidateSelection(d.project_id, d.id)
  return { success: 'Selection saved.' }
}

export type CreateSelectionsResult =
  | { ok: true; created: { key: string; id: string }[] }
  | { ok: false; error: string; entryErrors?: Record<string, DraftErrors> }

/**
 * Creates every drawer entry in one INSERT statement, so the batch is all-or-nothing.
 * Each entry's request_key makes a retried submit a no-op instead of a duplicate.
 */
export async function createSelectionsAction(input: { project_id: string; entries: Partial<SelectionDraft>[] }): Promise<CreateSelectionsResult> {
  const session = await requireSelectionsAccess()
  const projectId = z.uuid().safeParse(input?.project_id)
  if (!projectId.success) return { ok: false, error: 'Missing project.' }
  const entries = Array.isArray(input.entries) ? input.entries : []
  if (entries.length === 0) return { ok: false, error: 'Add at least one selection.' }
  if (entries.length > MAX_SELECTIONS_PER_BATCH) return { ok: false, error: `Create up to ${MAX_SELECTIONS_PER_BATCH} selections at a time.` }

  const valid: ValidDraft[] = []
  const entryErrors: Record<string, DraftErrors> = {}
  for (const entry of entries) {
    const { value, errors } = validateDraft(entry)
    if (value) valid.push(value)
    else entryErrors[typeof entry.key === 'string' ? entry.key : ''] = errors
  }
  if (Object.keys(entryErrors).length) return { ok: false, error: 'Please check the highlighted fields.', entryErrors }
  if (new Set(valid.map((v) => v.request_key)).size !== valid.length) return { ok: false, error: 'Refresh and try again.' }

  const supabase = await createClient()
  // RLS also enforces this; the explicit check gives a clear message for a foreign or hidden project.
  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId.data).eq('organization_id', session.organizationId).maybeSingle()
  if (!project) return { ok: false, error: 'Project not found.' }

  // The category index is case-insensitive (an expression index), so known names are skipped
  // up front and any race is absorbed by ignoring the unique-violation error.
  const { data: known } = await supabase.from('selection_categories').select('name')
  const knownNames = new Set((known ?? []).map((c) => (c.name as string).trim().toLowerCase()))
  const newCategories = [...new Map(valid.map((v) => [v.category.toLowerCase(), v.category])).entries()].filter(([k]) => !knownNames.has(k)).map(([, name]) => name)
  await Promise.all(newCategories.map((name) => supabase.from('selection_categories').insert({ organization_id: session.organizationId, name }).then(() => undefined)))

  const rows = valid.map((v) => ({ ...v, organization_id: session.organizationId, project_id: projectId.data }))
  const { error } = await supabase.from('selections').upsert(rows, { onConflict: 'organization_id,request_key', ignoreDuplicates: true })
  if (error) return { ok: false, error: friendlyDbError(error) }

  // Read back by key so a retried batch still reports the rows the first attempt created.
  const { data: saved, error: readError } = await supabase
    .from('selections')
    .select('id, request_key')
    .eq('project_id', projectId.data)
    .in(
      'request_key',
      valid.map((v) => v.request_key),
    )
  if (readError) return { ok: false, error: friendlyDbError(readError) }
  const byKey = new Map((saved ?? []).map((r) => [r.request_key as string, r.id as string]))
  revalidateSelection(projectId.data)
  return { ok: true, created: valid.flatMap((v) => (byKey.has(v.request_key) ? [{ key: v.request_key, id: byKey.get(v.request_key)! }] : [])) }
}

export async function deleteSelectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSelectionsAccess()
  const parsed = z.object({ project_id: z.uuid(), id: z.uuid() }).safeParse(formValues(formData))
  if (!parsed.success) return { error: 'Missing selection.' }
  const supabase = await createClient()
  const { data: opts } = await supabase.from('selection_options').select('photo_path, spec_path').eq('selection_id', parsed.data.id)
  const { error } = await supabase.from('selections').delete().eq('id', parsed.data.id).eq('project_id', parsed.data.project_id)
  if (error) return { error: friendlyDbError(error) }
  const paths = (opts ?? []).flatMap((o) => [o.photo_path, o.spec_path]).filter((p): p is string => Boolean(p))
  if (paths.length) await createAdminClient().storage.from(SELECTIONS_BUCKET).remove(paths)
  revalidateSelection(parsed.data.project_id)
  redirect(selectionsPath(parsed.data.project_id))
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const optionSchema = z.object({
  project_id: z.uuid(),
  selection_id: z.uuid(),
  id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  name: z.string().trim().min(1, 'Enter an option name').max(160),
  description: optionalText(2000),
  supplier: optionalText(160),
  model_number: optionalText(120),
  availability: optionalText(160),
  price: money(true),
  internal_cost: money(false),
  remove_photo: z.literal('on').optional(),
  remove_spec: z.literal('on').optional(),
})

function readFile(formData: FormData, key: string): File | null {
  const value = formData.get(key)
  return value instanceof File && value.size > 0 ? value : null
}

function validateFile(file: File, allowed: readonly string[]): string | null {
  if (file.size > SELECTION_FILE_MAX_BYTES) return 'Files must be 15 MB or smaller'
  if (!allowed.includes(file.type)) return allowed.includes('application/pdf') ? 'Upload a PDF, JPG, PNG, or WebP file' : 'Upload a JPG, PNG, or WebP image'
  return null
}

function extensionFor(file: File) {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  return file.type === 'application/pdf' ? 'pdf' : 'jpg'
}

export async function saveOptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const session = await requireSelectionsAccess()
  const parsed = optionSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const d = parsed.data

  const photo = readFile(formData, 'photo')
  const spec = readFile(formData, 'spec')
  const fieldErrors: Record<string, string> = {}
  const photoError = photo && validateFile(photo, SELECTION_PHOTO_TYPES)
  const specError = spec && validateFile(spec, SELECTION_SPEC_TYPES)
  if (photoError) fieldErrors.photo = photoError
  if (specError) fieldErrors.spec = specError
  if (Object.keys(fieldErrors).length) return { error: 'Please check the attached files.', fieldErrors, values }

  const supabase = await createClient()
  // RLS confirms the caller manages this selection before anything is uploaded.
  const { data: selection } = await supabase
    .from('selections')
    .select('id, status, organization_id')
    .eq('id', d.selection_id)
    .eq('project_id', d.project_id)
    .maybeSingle()
  if (!selection) return { error: 'Selection not found.', values }
  if (selection.status !== 'draft') return { error: 'Recall this selection to draft before changing its options.', values }

  let existing: { photo_path: string | null; spec_path: string | null } | null = null
  if (d.id) {
    const { data } = await supabase.from('selection_options').select('photo_path, spec_path').eq('id', d.id).eq('selection_id', d.selection_id).maybeSingle()
    if (!data) return { error: 'That option no longer exists. Refresh the page.', values, conflict: true }
    existing = data
  }

  const storage = createAdminClient().storage.from(SELECTIONS_BUCKET)
  const base = `${session.organizationId}/${d.project_id}/${d.selection_id}`
  const uploaded: string[] = []
  async function upload(file: File, kind: 'photo' | 'spec') {
    const path = `${base}/${kind}-${crypto.randomUUID()}.${extensionFor(file)}`
    const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw new Error('Upload failed')
    uploaded.push(path)
    return path
  }

  let photoPath = d.remove_photo ? null : (existing?.photo_path ?? null)
  let specPath = d.remove_spec ? null : (existing?.spec_path ?? null)
  let specName: string | null | undefined = d.remove_spec ? null : undefined
  try {
    if (photo) photoPath = await upload(photo, 'photo')
    if (spec) {
      specPath = await upload(spec, 'spec')
      specName = spec.name.slice(0, 200)
    }
  } catch {
    if (uploaded.length) await storage.remove(uploaded)
    return { error: 'A file could not be uploaded. Try again.', values }
  }

  const row = {
    name: d.name,
    description: d.description,
    supplier: d.supplier,
    model_number: d.model_number,
    availability: d.availability,
    price_cents: d.price ?? 0,
    internal_cost_cents: d.internal_cost,
    photo_path: photoPath,
    spec_path: specPath,
    ...(specName !== undefined ? { spec_name: specName } : {}),
  }

  const { error } = d.id
    ? await supabase.from('selection_options').update(row).eq('id', d.id).eq('selection_id', d.selection_id)
    : await supabase.from('selection_options').insert({ ...row, organization_id: selection.organization_id, selection_id: d.selection_id, sort_order: Date.now() % 2_000_000_000 })
  if (error) {
    if (uploaded.length) await storage.remove(uploaded)
    return { error: friendlyDbError(error), values }
  }

  const replaced = [existing?.photo_path !== photoPath ? existing?.photo_path : null, existing?.spec_path !== specPath ? existing?.spec_path : null].filter(
    (p): p is string => Boolean(p),
  )
  if (replaced.length) await storage.remove(replaced)

  revalidateSelection(d.project_id, d.selection_id)
  return { success: d.id ? 'Option updated.' : 'Option added.' }
}

export async function deleteOptionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireSelectionsAccess()
  const parsed = z.object({ project_id: z.uuid(), selection_id: z.uuid(), id: z.uuid() }).safeParse(formValues(formData))
  if (!parsed.success) return { error: 'Missing option.' }
  const { project_id, selection_id, id } = parsed.data
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('selection_options')
    .delete()
    .eq('id', id)
    .eq('selection_id', selection_id)
    .select('photo_path, spec_path')
  if (error) return { error: friendlyDbError(error) }
  const paths = (data ?? []).flatMap((o) => [o.photo_path, o.spec_path]).filter((p): p is string => Boolean(p))
  if (paths.length) await createAdminClient().storage.from(SELECTIONS_BUCKET).remove(paths)
  revalidateSelection(project_id, selection_id)
  return { success: 'Option removed.' }
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

const transitionSchema = z
  .object({
    project_id: z.uuid(),
    selection_id: z.uuid(),
    action: z.enum(SELECTION_ACTIONS),
    expected_version: z.coerce.number().int().positive(),
    note: z.string().trim().max(2000, 'Notes must be 2,000 characters or fewer').optional(),
  })
  .superRefine((v, ctx) => {
    if (NOTE_REQUIRED_ACTIONS.has(v.action) && !v.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Add a note for this action' })
  })

const TRANSITION_MESSAGES: Record<(typeof SELECTION_ACTIONS)[number], string> = {
  send: 'Sent to the homeowner.',
  recall: 'Recalled to draft.',
  approve: 'Selection approved.',
  require_change_order: 'Marked as requiring a change order.',
  request_clarification: 'Clarification requested from the homeowner.',
  return_revision: 'Returned to the homeowner for revision.',
  reopen: 'Selection reopened.',
  reject: 'Choice rejected.',
  cancel: 'Selection canceled.',
}

export async function transitionSelectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  await requireSelectionsAccess()
  const parsed = transitionSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const v = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('selection_transition', {
    p_selection: v.selection_id,
    p_action: v.action,
    p_expected_version: v.expected_version,
    p_note: v.note ?? null,
  })
  if (error) return { error: friendlyDbError(error).replace(/^STALE:\s*/, ''), conflict: isStale(error.message), values }
  revalidateSelection(v.project_id, v.selection_id)
  return { success: TRANSITION_MESSAGES[v.action] }
}

export async function createSelectionChangeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSelectionsAccess()
  await requireFeature(session.organizationId, 'change_orders')
  const parsed = z
    .object({ project_id: z.uuid(), selection_id: z.uuid(), expected_version: z.coerce.number().int().positive() })
    .safeParse(formValues(formData))
  if (!parsed.success) return { error: 'Missing selection.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('selection_create_change_order', {
    p_selection: parsed.data.selection_id,
    p_expected_version: parsed.data.expected_version,
  })
  if (error || !data) return { error: friendlyDbError(error).replace(/^STALE:\s*/, ''), conflict: isStale(error?.message) }
  revalidateSelection(parsed.data.project_id, parsed.data.selection_id)
  revalidatePath(`/projects/${parsed.data.project_id}/change-orders`)
  redirect(changeOrderPath(parsed.data.project_id, data as string))
}

// ---------------------------------------------------------------------------
// Homeowner portal
// ---------------------------------------------------------------------------

const chooseSchema = z.object({
  selection_id: z.uuid(),
  option_id: z.uuid('Choose one of the options'),
  expected_version: z.coerce.number().int().positive(),
  request_key: z.uuid(),
  comment: z.string().trim().max(2000, 'Comments are limited to 2,000 characters').optional(),
})

export async function choosePortalSelectionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { error: 'Your session expired. Sign in again.', authRequired: true }
  if (session.role !== 'client') return { error: 'Only homeowners can make selections in the portal.' }
  const parsed = chooseSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const state = fromZodError(parsed.error)
    return { ...state, error: Object.values(state.fieldErrors ?? {})[0] ?? 'Please check your choice.' }
  }
  const v = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('portal_choose_selection_option', {
    p_selection: v.selection_id,
    p_option: v.option_id,
    p_expected_version: v.expected_version,
    p_request_key: v.request_key,
    p_comment: v.comment || null,
  })
  if (error) return { error: friendlyDbError(error).replace(/^STALE:\s*/, ''), conflict: isStale(error.message) }
  revalidatePath('/portal')
  revalidatePath('/portal/selections')
  revalidatePath(portalSelectionPath(v.selection_id))
  return { success: 'Your choice was sent to your builder for review.' }
}
