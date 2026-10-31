'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { DECISION_METHODS, ESTIMATE_CATEGORIES } from '@/lib/estimates'

const uuid = z.uuid()

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === '' ? null : v))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date')

/** Parses a dollar string into integer cents without floating-point arithmetic. */
function dollarsToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

const money = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return 0
      const cents = dollarsToCents(v)
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a dollar amount like 1250.00` })
        return z.NEVER
      }
      return cents
    })

const optionalMoney = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return null
    const cents = dollarsToCents(v)
    if (cents === null) {
      ctx.addIssue({ code: 'custom', message: 'Enter a dollar amount like 85000' })
      return z.NEVER
    }
    return cents
  })

const percent = z
  .string()
  .trim()
  .transform((v) => (v === '' ? '0' : v))
  .refine((v) => /^\d{1,3}(\.\d{1,3})?$/.test(v) && Number(v) <= 100, 'Enter a percentage between 0 and 100')

const estimateSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter an estimate name').max(160),
    description: optionalText(4000),
    estimate_date: isoDate,
    expiration_date: optionalDate,
    markup_percent: percent,
    contingency_percent: percent,
    land_cost: optionalMoney,
    notes: optionalText(5000),
    is_demo: z.string().optional().transform((v) => v === 'on'),
  })
  .refine((d) => !d.expiration_date || d.expiration_date >= d.estimate_date, {
    message: 'Expiration must be on or after the estimate date',
    path: ['expiration_date'],
  })

const createSchema = z.object({ project_id: z.uuid('Select a project') })

function toEstimateRow(d: z.infer<typeof estimateSchema>) {
  const { land_cost, ...rest } = d
  return { ...rest, land_cost_cents: land_cost }
}

function revalidateEstimate(id: string, projectId?: string) {
  revalidatePath('/estimates')
  revalidatePath(`/estimates/${id}`)
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

export async function createEstimateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  const values = formValues(formData)
  const project = createSchema.safeParse(values)
  const parsed = estimateSchema.safeParse(values)
  if (!project.success) return { ...fromZodError(project.error), values }
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('estimates')
    .insert({
      ...toEstimateRow(parsed.data),
      project_id: project.data.project_id,
      organization_id: session.organizationId,
      created_by: session.userId,
      updated_by: session.userId,
    })
    .select('id')
    .single()
  if (error) return { error: friendlyDbError(error), values }

  revalidateEstimate(data.id, project.data.project_id)
  redirect(`/estimates/${data.id}`)
}

export async function updateEstimateAction(
  estimateId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success) return { error: 'Invalid estimate.' }
  const values = formValues(formData)
  const parsed = estimateSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('estimates')
    .update({ ...toEstimateRow(parsed.data), updated_by: session.userId })
    .eq('id', estimateId)
    .eq('organization_id', session.organizationId)
    .select('project_id')
    .single()
  if (error) return { error: friendlyDbError(error), values }

  revalidateEstimate(estimateId, data.project_id)
  redirect(`/estimates/${estimateId}`)
}

const lineItemSchema = z.object({
  category: z.enum(ESTIMATE_CATEGORIES, 'Select a category'),
  description: z.string().trim().min(1, 'Describe the item').max(300),
  quantity: z
    .string()
    .trim()
    .refine((v) => /^\d{1,10}(\.\d{1,3})?$/.test(v), 'Quantity must be a number with up to 3 decimals'),
  unit: z.string().trim().min(1, 'Enter a unit').max(20),
  material_unit: money('Material cost'),
  labor_unit: money('Labor cost'),
  other_unit: money('Other cost'),
  is_allowance: z.string().optional().transform((v) => v === 'on'),
  notes: optionalText(1000),
})

function toLineRow(d: z.infer<typeof lineItemSchema>) {
  return {
    category: d.category,
    description: d.description,
    quantity: d.quantity,
    unit: d.unit,
    material_unit_cents: d.material_unit,
    labor_unit_cents: d.labor_unit,
    other_unit_cents: d.other_unit,
    is_allowance: d.is_allowance,
    notes: d.notes,
  }
}

export async function addLineItemAction(
  estimateId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success) return { error: 'Invalid estimate.' }
  const values = formValues(formData)
  const parsed = lineItemSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { data: last } = await supabase
    .from('estimate_line_items')
    .select('sort_order')
    .eq('estimate_id', estimateId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('estimate_line_items').insert({
    ...toLineRow(parsed.data),
    estimate_id: estimateId,
    organization_id: session.organizationId,
    sort_order: (last?.sort_order ?? 0) + 10,
  })
  if (error) return { error: friendlyDbError(error), values }

  revalidateEstimate(estimateId)
  return { success: 'Line item added.' }
}

export async function updateLineItemAction(
  estimateId: string,
  itemId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success || !uuid.safeParse(itemId).success) return { error: 'Invalid line item.' }
  const values = formValues(formData)
  const parsed = lineItemSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const supabase = await createClient()
  const { error } = await supabase
    .from('estimate_line_items')
    .update(toLineRow(parsed.data))
    .eq('id', itemId)
    .eq('estimate_id', estimateId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error), values }

  revalidateEstimate(estimateId)
  return { success: 'Line item saved.' }
}

export async function deleteLineItemAction(estimateId: string, itemId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success || !uuid.safeParse(itemId).success) return { error: 'Invalid line item.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('estimate_line_items')
    .delete()
    .eq('id', itemId)
    .eq('estimate_id', estimateId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidateEstimate(estimateId)
  return { success: 'Line item removed.' }
}

const cents = z.number().int().min(0).max(1_000_000_000_000)
const sheetItemSchema = z.object({
  id: z.uuid().nullable(),
  category: z.enum(ESTIMATE_CATEGORIES),
  description: z.string().trim().min(1, 'Describe the item').max(300),
  quantity: z.string().trim().regex(/^\d{1,10}(\.\d{1,3})?$/, 'Invalid quantity'),
  unit: z.string().trim().min(1).max(20),
  material_unit_cents: cents,
  labor_unit_cents: cents,
  other_unit_cents: cents,
  is_allowance: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
})
const sheetSchema = z.array(sheetItemSchema).max(1000, 'An estimate can have at most 1,000 line items')

export type SaveSheetResult = { ok: true; updatedAt: string } | { ok: false; error: string; rowIndex?: number }

/** Saves the whole line-item grid in one transaction (see save_estimate_line_items). */
export async function saveEstimateLineItemsAction(
  estimateId: string,
  expectedUpdatedAt: string,
  items: unknown,
): Promise<SaveSheetResult> {
  await requireManager()
  if (!uuid.safeParse(estimateId).success) return { ok: false, error: 'Invalid estimate.' }
  const parsed = sheetSchema.safeParse(items)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const rowIndex = typeof issue?.path[0] === 'number' ? issue.path[0] : undefined
    return {
      ok: false,
      error: rowIndex === undefined ? (issue?.message ?? 'Invalid line items.') : `Row ${rowIndex + 1}: ${issue.message}`,
      rowIndex,
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('save_estimate_line_items', {
    p_estimate: estimateId,
    p_items: parsed.data,
    p_expected_updated_at: expectedUpdatedAt,
  })
  if (error) return { ok: false, error: friendlyDbError(error) }

  revalidateEstimate(estimateId)
  return { ok: true, updatedAt: String(data) }
}

const simpleTransitions = ['draft', 'internal_review', 'submitted'] as const

export async function changeEstimateStatusAction(
  estimateId: string,
  status: (typeof simpleTransitions)[number],
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success || !simpleTransitions.includes(status)) return { error: 'Invalid request.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('estimates')
    .update({ status, updated_by: session.userId })
    .eq('id', estimateId)
    .eq('organization_id', session.organizationId)
    .select('project_id')
    .single()
  if (error) return { error: friendlyDbError(error) }

  revalidateEstimate(estimateId, data.project_id)
  return { success: 'Estimate status updated.' }
}

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decision_by_name: z.string().trim().min(2, 'Enter who made the decision').max(160),
  decision_method: z.enum(DECISION_METHODS, 'Select how the decision was communicated'),
  decision_date: isoDate,
  decision_note: optionalText(2000),
})

export async function recordEstimateDecisionAction(
  estimateId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success) return { error: 'Invalid estimate.' }
  const values = formValues(formData)
  const parsed = decisionSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const today = new Date().toISOString().slice(0, 10)
  const decisionAt =
    parsed.data.decision_date === today ? new Date().toISOString() : `${parsed.data.decision_date}T12:00:00Z`

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('estimates')
    .update({
      status: parsed.data.decision,
      decision_by_name: parsed.data.decision_by_name,
      decision_method: parsed.data.decision_method,
      decision_note: parsed.data.decision_note,
      decision_at: decisionAt,
      updated_by: session.userId,
    })
    .eq('id', estimateId)
    .eq('organization_id', session.organizationId)
    .select('project_id')
    .single()
  if (error) return { error: friendlyDbError(error), values }

  revalidateEstimate(estimateId, data.project_id)
  return { success: parsed.data.decision === 'approved' ? 'Approval recorded.' : 'Rejection recorded.' }
}

export async function createEstimateRevisionAction(estimateId: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(estimateId).success) return { error: 'Invalid estimate.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_estimate_revision', { p_estimate: estimateId })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/estimates')
  redirect(`/estimates/${data}`)
}

export async function duplicateEstimateAction(estimateId: string): Promise<ActionState> {
  await requireManager()
  if (!uuid.safeParse(estimateId).success) return { error: 'Invalid estimate.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('duplicate_estimate', { p_estimate: estimateId })
  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/estimates')
  redirect(`/estimates/${data}`)
}

export async function deleteDraftEstimateAction(estimateId: string): Promise<ActionState> {
  const session = await requireManager()
  if (!uuid.safeParse(estimateId).success) return { error: 'Invalid estimate.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('estimates')
    .delete()
    .eq('id', estimateId)
    .eq('organization_id', session.organizationId)
    .select('project_id')
    .maybeSingle()
  if (error) return { error: friendlyDbError(error) }
  if (!data) return { error: 'Estimate not found.' }
  revalidatePath('/estimates')
  revalidatePath(`/projects/${data.project_id}`)
  redirect('/estimates')
}
