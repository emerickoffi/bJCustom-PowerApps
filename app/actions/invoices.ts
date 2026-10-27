'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { DRAW_MILESTONES, PAYMENT_METHODS, dollarsToCents } from '@/lib/invoices'

const uuid = z.uuid()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date')
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters`)
    .transform((v) => (v === '' ? null : v))

const lineSchema = z.object({
  description: z.string().trim().min(1, 'Each line needs a description').max(500),
  quantity: z
    .string()
    .trim()
    .refine((v) => /^\d{1,7}(\.\d{1,3})?$/.test(v) && Number(v) > 0, 'Quantity must be a positive number'),
  unitRate: z.string().trim(),
  taxable: z.boolean(),
})

const draftSchema = z
  .object({
    id: z.union([uuid, z.literal('')]),
    project_id: uuid.or(z.literal('')).refine((v) => v !== '', 'Choose a project'),
    estimate_id: z.union([uuid, z.literal('')]),
    invoice_type: z.enum(['standard', 'draw']),
    draw_milestone: z.union([z.enum(DRAW_MILESTONES), z.literal('')]),
    title: z.string().trim().min(2, 'Enter a title').max(160),
    invoice_date: isoDate,
    due_date: isoDate,
    tax_percent: z
      .string()
      .trim()
      .transform((v) => (v === '' ? '0' : v))
      .refine((v) => /^\d{1,3}(\.\d{1,3})?$/.test(v) && Number(v) <= 100, 'Tax must be between 0 and 100'),
    payment_terms: optionalText(200),
    payment_instructions: optionalText(2000),
    notes: optionalText(5000),
  })
  .refine((v) => v.due_date >= v.invoice_date, { path: ['due_date'], message: 'Due date cannot be before the invoice date' })
  .refine((v) => v.invoice_type === 'standard' || v.draw_milestone !== '', {
    path: ['draw_milestone'],
    message: 'Choose the milestone this draw is for',
  })

async function requireInvoiceManager() {
  const session = await requireManager()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.invoices) redirect('/dashboard')
  return session
}

function revalidateInvoice(id?: string, projectId?: string) {
  revalidatePath('/invoices')
  if (id) revalidatePath(`/invoices/${id}`)
  if (projectId) revalidatePath(`/projects/${projectId}`)
  revalidatePath('/portal', 'layout')
}

export async function saveInvoiceDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireInvoiceManager()
  const values = formValues(formData)
  const parsed = draftSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }

  let rawLines: unknown
  try {
    rawLines = JSON.parse(values.lines ?? '[]')
  } catch {
    return { error: 'The line items could not be read. Please try again.', values }
  }
  const linesParsed = z.array(lineSchema).max(200, 'Keep invoices under 200 lines').safeParse(rawLines)
  if (!linesParsed.success) return { error: linesParsed.error.issues[0]?.message ?? 'Check the line items.', values }
  const lines = []
  for (const line of linesParsed.data) {
    const rate = dollarsToCents(line.unitRate)
    if (rate === null) return { error: `"${line.description}" needs a rate like 1250.00`, values }
    lines.push({ description: line.description, quantity: line.quantity, unit_rate_cents: rate, taxable: line.taxable })
  }

  const supabase = await createClient()
  const d = parsed.data
  const { data: project } = await supabase
    .from('projects')
    .select('id, primary_client_id')
    .eq('id', d.project_id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) return { error: 'That project could not be found.', values }
  if (!project.primary_client_id) return { error: 'Add a primary client to this project before invoicing it.', values }

  const record = {
    project_id: d.project_id,
    client_id: project.primary_client_id,
    estimate_id: d.estimate_id || null,
    invoice_type: d.invoice_type,
    draw_milestone: d.invoice_type === 'draw' ? d.draw_milestone || null : null,
    title: d.title,
    invoice_date: d.invoice_date,
    due_date: d.due_date,
    tax_percent: Number(d.tax_percent),
    payment_terms: d.payment_terms,
    payment_instructions: d.payment_instructions,
    notes: d.notes,
  }

  let id = d.id
  if (id) {
    const { error } = await supabase.from('invoices').update(record).eq('id', id).eq('status', 'draft')
    if (error) return { error: friendlyDbError(error), values }
  } else {
    const { data, error } = await supabase
      .from('invoices')
      .insert({ ...record, organization_id: session.organizationId })
      .select('id')
      .single()
    if (error || !data) return { error: friendlyDbError(error), values }
    id = data.id
  }

  const { error: linesError } = await supabase.rpc('replace_invoice_lines', { p_invoice: id, p_lines: lines })
  if (linesError) return { error: friendlyDbError(linesError), values }

  revalidateInvoice(id, d.project_id)
  redirect(`/invoices/${id}`)
}

type Result = { error?: string; success?: string }

async function runRpc(fn: string, args: Record<string, unknown>, invoiceId: string, success: string): Promise<Result> {
  await requireInvoiceManager()
  const supabase = await createClient()
  const { error } = await supabase.rpc(fn, args)
  if (error) return { error: friendlyDbError(error) }
  revalidateInvoice(invoiceId)
  return { success }
}

export async function issueInvoice(invoiceId: string, publish: boolean): Promise<Result> {
  if (!uuid.safeParse(invoiceId).success) return { error: 'Invoice not found.' }
  return runRpc(
    'issue_invoice',
    { p_invoice: invoiceId, p_publish: publish },
    invoiceId,
    publish ? 'Invoice issued and shared with the homeowner.' : 'Invoice issued.',
  )
}

export async function setInvoicePublished(invoiceId: string, published: boolean): Promise<Result> {
  if (!uuid.safeParse(invoiceId).success) return { error: 'Invoice not found.' }
  return runRpc(
    'set_invoice_published',
    { p_invoice: invoiceId, p_published: published },
    invoiceId,
    published ? 'Shared with the homeowner portal.' : 'Hidden from the homeowner portal.',
  )
}

export async function voidInvoice(invoiceId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(invoiceId).success) return { error: 'Invoice not found.' }
  const trimmed = reason.trim()
  if (trimmed.length < 3 || trimmed.length > 1000) return { error: 'Enter a reason for voiding (3–1000 characters).' }
  return runRpc('void_invoice', { p_invoice: invoiceId, p_reason: trimmed }, invoiceId, 'Invoice voided.')
}

export async function reversePayment(invoiceId: string, paymentId: string, reason: string): Promise<Result> {
  if (!uuid.safeParse(invoiceId).success || !uuid.safeParse(paymentId).success) return { error: 'Payment not found.' }
  const trimmed = reason.trim()
  if (trimmed.length < 3 || trimmed.length > 1000) return { error: 'Enter a reason for the reversal (3–1000 characters).' }
  return runRpc('reverse_invoice_payment', { p_payment: paymentId, p_reason: trimmed }, invoiceId, 'Payment reversed.')
}

export async function deleteDraftInvoice(invoiceId: string): Promise<Result> {
  await requireInvoiceManager()
  if (!uuid.safeParse(invoiceId).success) return { error: 'Invoice not found.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('invoices').delete().eq('id', invoiceId).eq('status', 'draft').select('id')
  if (error) return { error: friendlyDbError(error) }
  if (!data?.length) return { error: 'Only draft invoices can be deleted. Void issued invoices instead.' }
  revalidateInvoice()
  redirect('/invoices')
}

const paymentSchema = z.object({
  invoice_id: uuid,
  payment_date: isoDate.refine((v) => v <= new Date().toISOString().slice(0, 10), 'The payment date cannot be in the future'),
  amount: z.string().trim(),
  method: z.enum(PAYMENT_METHODS, { message: 'Choose how the payment was made' }),
  reference: optionalText(120),
  notes: optionalText(2000),
})

export async function recordPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireInvoiceManager()
  const values = formValues(formData)
  const parsed = paymentSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const cents = dollarsToCents(parsed.data.amount)
  if (!cents || cents <= 0) return { error: 'Please correct the highlighted fields.', fieldErrors: { amount: 'Enter an amount like 2500.00' }, values }

  const supabase = await createClient()
  const { error } = await supabase.from('invoice_payments').insert({
    organization_id: session.organizationId,
    invoice_id: parsed.data.invoice_id,
    payment_date: parsed.data.payment_date,
    amount_cents: cents,
    method: parsed.data.method,
    reference: parsed.data.reference,
    notes: parsed.data.notes,
  })
  if (error) return { error: friendlyDbError(error), values }
  revalidateInvoice(parsed.data.invoice_id)
  return { success: 'Payment recorded.' }
}
