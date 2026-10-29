'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { parseSignedDollarsToCents } from '@/lib/financials'
import {
  CHANGE_ORDER_DECISION_METHODS,
  changeOrderPath,
  changeOrdersPath,
  parseLines,
  type LineInput,
} from '@/lib/change-orders'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === '' ? null : v))

const headerSchema = z.object({
  project_id: z.uuid('Missing project'),
  id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
  title: z.string().trim().min(2, 'Enter a title').max(160),
  description: optionalText(4000),
  reason: optionalText(2000),
  requested_by: optionalText(160),
  schedule_impact_days: z
    .string()
    .trim()
    .refine((v) => v === '' || (/^-?\d{1,4}$/.test(v) && Number(v) >= -365 && Number(v) <= 3650), 'Enter whole days between -365 and 3650')
    .transform((v) => (v === '' ? null : Number(v))),
  price_adjustment: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const cents = parseSignedDollarsToCents(v || '0')
      if (cents === null) {
        ctx.addIssue({ code: 'custom', message: 'Enter a dollar amount; use a minus sign for credits' })
        return z.NEVER
      }
      return cents
    }),
  lines_json: z.string().max(200_000),
})

function parseLineRows(raw: string): LineInput[] | null {
  try {
    const value: unknown = JSON.parse(raw || '[]')
    if (!Array.isArray(value)) return null
    return value.map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '')
      return { category: s('category'), description: s('description'), quantity: s('quantity'), unit: s('unit'), unit_cost: s('unit_cost') }
    })
  } catch {
    return null
  }
}

function revalidate(projectId: string, id?: string) {
  revalidatePath(changeOrdersPath(projectId))
  if (id) revalidatePath(changeOrderPath(projectId, id))
}

export async function saveChangeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const values = formValues(formData)
  const parsed = headerSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  const rows = parseLineRows(parsed.data.lines_json)
  if (!rows) return { error: 'Line items could not be read. Reload the page and try again.', values }
  const { lines, errors } = parseLines(rows)
  if (Object.keys(errors).length) return { error: 'Please correct the highlighted line items.', fieldErrors: errors, values }

  const d = parsed.data
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('save_change_order', {
    p_project: d.project_id,
    p_id: d.id,
    p_header: {
      title: d.title,
      description: d.description,
      reason: d.reason,
      requested_by: d.requested_by,
      schedule_impact_days: d.schedule_impact_days,
      price_adjustment_cents: d.price_adjustment,
    },
    p_lines: lines.map(({ category, description, quantity, unit, unit_cost_cents }) => ({ category, description, quantity, unit, unit_cost_cents })),
  })
  if (error || !id) return { error: friendlyDbError(error), values }

  revalidate(d.project_id, id as string)
  redirect(changeOrderPath(d.project_id, id as string))
}

const transitionSchema = z.object({
  project_id: z.uuid(),
  id: z.uuid(),
  to: z.enum(['draft', 'internal_review', 'awaiting_homeowner', 'void']),
  version: z.coerce.number().int().positive(),
  note: optionalText(2000),
})

export async function transitionChangeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const parsed = transitionSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)
  const d = parsed.data
  if (d.to === 'void' && !d.note) return { error: 'Enter a reason for voiding.', fieldErrors: { note: 'Required' } }

  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_change_order', {
    p_id: d.id,
    p_to: d.to,
    p_expected_version: d.version,
    p_note: d.note,
  })
  if (error) return { error: friendlyDbError(error) }
  revalidate(d.project_id, d.id)
  return { success: 'Change order updated.' }
}

const decisionSchema = z.object({
  project_id: z.uuid(),
  id: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  version: z.coerce.number().int().positive(),
  decision_by_name: z.string().trim().min(2, 'Enter who made the decision').max(160),
  decision_method: z.enum(CHANGE_ORDER_DECISION_METHODS.map((m) => m.value) as [string, ...string[]], 'Choose a method'),
  decision_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date'),
  decision_note: optionalText(2000),
  signature_request_id: z
    .string()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.uuid().nullable()),
})

export async function decideChangeOrderAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const values = formValues(formData)
  const parsed = decisionSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_change_order', {
    p_id: d.id,
    p_decision: d.decision,
    p_expected_version: d.version,
    p_by_name: d.decision_by_name,
    p_method: d.decision_method,
    p_note: d.decision_note,
    // Noon UTC keeps the recorded calendar day stable across time zones.
    p_decision_at: `${d.decision_date}T12:00:00Z`,
    p_signature_request: d.signature_request_id,
  })
  if (error) return { error: friendlyDbError(error), values }
  revalidate(d.project_id, d.id)
  return { success: d.decision === 'approved' ? 'Approval recorded.' : 'Rejection recorded.' }
}

export async function deleteDraftChangeOrderAction(formData: FormData) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'change_orders')
  const projectId = z.uuid().parse(formData.get('project_id'))
  const id = z.uuid().parse(formData.get('id'))
  const supabase = await createClient()
  await supabase.from('change_orders').delete().eq('id', id).eq('project_id', projectId)
  revalidate(projectId)
  redirect(changeOrdersPath(projectId))
}
