'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { validateBill, validateCommitment, validatePayment } from '@/lib/vendor-bills'

const uuid = z.uuid()
type Result = { ok: true } | { ok: false; error: string }

type Ctx = { supabase: Awaited<ReturnType<typeof createClient>>; userId: string; organizationId: string }

/** Managers only, and only on projects where the database says this user may manage costs. RLS enforces the same rule. */
async function costContext(projectId: string): Promise<{ ok: true; ctx: Ctx } | { ok: false; state: ActionState }> {
  const session = await getSession()
  if (!session) return { ok: false, state: { error: 'Your session has expired. Sign in again.', authRequired: true } }
  if (!session.organizationId || (session.role !== 'org_admin' && session.role !== 'project_manager')) {
    return { ok: false, state: { error: 'You do not have permission to perform this action.' } }
  }
  if (!uuid.safeParse(projectId).success) return { ok: false, state: { error: 'Missing project.' } }
  const supabase = await createClient()
  const [{ data: project }, { data: allowed }] = await Promise.all([
    supabase.from('projects').select('id').eq('id', projectId).eq('organization_id', session.organizationId).maybeSingle(),
    supabase.rpc('can_manage_project_costs', { p_project: projectId }),
  ])
  if (!project || !allowed) return { ok: false, state: { error: 'You do not have permission to manage costs on this project.' } }
  return { ok: true, ctx: { supabase, userId: session.userId, organizationId: session.organizationId } }
}

const financialsPath = (projectId: string) => `/projects/${projectId}/financials`

function fail(state: ActionState, values: Record<string, string>): ActionState {
  return { ...state, values }
}

async function approvedCommitments(ctx: Ctx, projectId: string) {
  const { data } = await ctx.supabase.from('project_commitments').select('id, cost_category').eq('project_id', projectId).eq('status', 'approved')
  return (data ?? []).map((c) => ({ id: c.id, category: c.cost_category }))
}

async function assertAttachment(ctx: Ctx, projectId: string, documentId: string | null): Promise<string | null> {
  if (!documentId) return null
  if (!uuid.safeParse(documentId).success) return 'The attached invoice could not be found.'
  const { data } = await ctx.supabase.from('project_documents').select('id').eq('id', documentId).eq('project_id', projectId).maybeSingle()
  return data ? null : 'The attached invoice could not be found on this project.'
}

export async function saveVendorBillAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const projectId = values.project_id ?? ''
  const billId = values.bill_id || null
  const intent = values.intent === 'approve' ? 'approve' : 'draft'
  const access = await costContext(projectId)
  if (!access.ok) return fail(access.state, values)
  const { ctx } = access

  const parsed = validateBill(values, await approvedCommitments(ctx, projectId))
  if (!parsed.ok) return { error: 'Please correct the highlighted fields.', fieldErrors: parsed.errors, values }
  const d = parsed.data
  const attachmentError = await assertAttachment(ctx, projectId, d.attachmentDocumentId)
  if (attachmentError) return { error: attachmentError, fieldErrors: { attachment_document_id: attachmentError }, values }

  const row = {
    vendor_name: d.vendorName,
    bill_number: d.billNumber,
    bill_date: d.billDate,
    due_date: d.dueDate,
    description: d.description,
    notes: d.notes,
    amount_cents: d.amountCents,
    cost_category: d.category,
    commitment_id: d.commitmentId,
    attachment_document_id: d.attachmentDocumentId,
    updated_by: ctx.userId,
  }

  let savedId: string
  if (billId) {
    if (!uuid.safeParse(billId).success) return fail({ error: 'This bill could not be found.' }, values)
    const { data, error } = await ctx.supabase.from('vendor_bills').update(row).eq('id', billId).eq('project_id', projectId).eq('status', 'draft').select('id').maybeSingle()
    if (error) return fail({ error: billError(error) }, values)
    if (!data) return fail({ error: 'Only bills awaiting approval can be edited. Refresh to see the latest status.', conflict: true }, values)
    savedId = data.id
  } else {
    const key = values.idempotency_key ?? ''
    if (!uuid.safeParse(key).success) return fail({ error: 'Something went wrong. Please try again.' }, values)
    const { data: existing } = await ctx.supabase.from('vendor_bills').select('id').eq('idempotency_key', key).maybeSingle()
    if (existing) {
      savedId = existing.id
    } else {
      const { data, error } = await ctx.supabase
        .from('vendor_bills')
        .insert({ ...row, organization_id: ctx.organizationId, project_id: projectId, status: 'draft', idempotency_key: key, created_by: ctx.userId })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23505') {
          const { data: retry } = await ctx.supabase.from('vendor_bills').select('id').eq('idempotency_key', key).maybeSingle()
          if (!retry) return fail({ error: 'A bill with this invoice number from this vendor already exists on this project.', fieldErrors: { bill_number: 'Already recorded for this vendor' } }, values)
          savedId = retry.id
        } else {
          return fail({ error: billError(error) }, values)
        }
      } else {
        savedId = data.id
      }
    }
  }

  revalidatePath(financialsPath(projectId))
  if (intent === 'approve') {
    const approved = await approveBill(ctx, projectId, savedId)
    if (!approved.ok) return { savedId, warning: `Bill saved as awaiting approval, but it could not be approved: ${approved.error}` }
    return { savedId, success: 'Bill saved and approved' }
  }
  return { savedId, success: billId ? 'Bill updated' : 'Bill saved, awaiting approval' }
}

function billError(error: { code?: string; message?: string }) {
  if (error.code === '23505') return 'A bill with this invoice number from this vendor already exists on this project.'
  return friendlyDbError(error)
}

async function approveBill(ctx: Ctx, projectId: string, billId: string): Promise<Result> {
  const { data, error } = await ctx.supabase
    .from('vendor_bills')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: ctx.userId, updated_by: ctx.userId })
    .eq('id', billId)
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data) return { ok: false, error: 'This bill is no longer awaiting approval.' }
  return { ok: true }
}

export async function approveVendorBillAction(projectId: string, billId: string): Promise<Result> {
  const access = await costContext(projectId)
  if (!access.ok) return { ok: false, error: access.state.error ?? 'Not allowed.' }
  if (!uuid.safeParse(billId).success) return { ok: false, error: 'This bill could not be found.' }
  const result = await approveBill(access.ctx, projectId, billId)
  revalidatePath(financialsPath(projectId))
  return result
}

export async function voidVendorBillAction(projectId: string, billId: string, reason: string): Promise<Result> {
  const access = await costContext(projectId)
  if (!access.ok) return { ok: false, error: access.state.error ?? 'Not allowed.' }
  const trimmed = reason.trim()
  if (trimmed.length < 3 || trimmed.length > 500) return { ok: false, error: 'Enter a reason between 3 and 500 characters.' }
  if (!uuid.safeParse(billId).success) return { ok: false, error: 'This bill could not be found.' }
  const { ctx } = access
  const { count } = await ctx.supabase.from('vendor_payments').select('id', { count: 'exact', head: true }).eq('bill_id', billId).is('reversed_at', null)
  if ((count ?? 0) > 0) return { ok: false, error: 'Reverse the recorded payments before voiding this bill.' }
  const { data, error } = await ctx.supabase
    .from('vendor_bills')
    .update({ status: 'voided', voided_at: new Date().toISOString(), void_reason: trimmed, updated_by: ctx.userId })
    .eq('id', billId)
    .eq('project_id', projectId)
    .neq('status', 'voided')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data) return { ok: false, error: 'This bill is already voided.' }
  revalidatePath(financialsPath(projectId))
  return { ok: true }
}

export async function recordVendorPaymentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const projectId = values.project_id ?? ''
  const billId = values.bill_id ?? ''
  const access = await costContext(projectId)
  if (!access.ok) return fail(access.state, values)
  const { ctx } = access
  if (!uuid.safeParse(billId).success || !uuid.safeParse(values.idempotency_key ?? '').success) {
    return fail({ error: 'Something went wrong. Please try again.' }, values)
  }

  const [{ data: bill }, { data: payments }] = await Promise.all([
    ctx.supabase.from('vendor_bills').select('id, status, amount_cents').eq('id', billId).eq('project_id', projectId).maybeSingle(),
    ctx.supabase.from('vendor_payments').select('amount_cents').eq('bill_id', billId).is('reversed_at', null),
  ])
  if (!bill) return fail({ error: 'This bill could not be found.' }, values)
  if (bill.status !== 'approved') return fail({ error: 'Only approved bills can be paid.' }, values)
  const paid = (payments ?? []).reduce((t, p) => t + Number(p.amount_cents), 0)
  const parsed = validatePayment(values, Number(bill.amount_cents) - paid)
  if (!parsed.ok) return { error: 'Please correct the highlighted fields.', fieldErrors: parsed.errors, values }
  const d = parsed.data

  // The RPC locks the bill row and rechecks the balance, so concurrent submissions cannot overpay.
  const { error } = await ctx.supabase.rpc('record_vendor_payment', {
    p_bill: billId,
    p_payment_date: d.paymentDate,
    p_amount_cents: d.amountCents,
    p_method: d.method,
    p_reference: d.reference ?? '',
    p_idempotency_key: values.idempotency_key,
    p_notes: d.notes ?? '',
  })
  if (error) return fail({ error: friendlyDbError(error) }, values)
  revalidatePath(financialsPath(projectId))
  return { savedId: billId, success: 'Payment recorded' }
}

export async function reverseVendorPaymentAction(projectId: string, paymentId: string, reason: string): Promise<Result> {
  const access = await costContext(projectId)
  if (!access.ok) return { ok: false, error: access.state.error ?? 'Not allowed.' }
  const trimmed = reason.trim()
  if (trimmed.length < 3 || trimmed.length > 500) return { ok: false, error: 'Enter a reason between 3 and 500 characters.' }
  if (!uuid.safeParse(paymentId).success) return { ok: false, error: 'This payment could not be found.' }
  const { error } = await access.ctx.supabase.rpc('reverse_vendor_payment', { p_payment: paymentId, p_reason: trimmed })
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidatePath(financialsPath(projectId))
  return { ok: true }
}

export async function saveCommitmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const projectId = values.project_id ?? ''
  const commitmentId = values.commitment_id || null
  const intent = values.intent === 'approve' ? 'approve' : 'draft'
  const access = await costContext(projectId)
  if (!access.ok) return fail(access.state, values)
  const { ctx } = access
  const parsed = validateCommitment(values)
  if (!parsed.ok) return { error: 'Please correct the highlighted fields.', fieldErrors: parsed.errors, values }
  const d = parsed.data
  const row = { vendor_name: d.vendorName, description: d.description, amount_cents: d.amountCents, cost_category: d.category, notes: d.notes, updated_by: ctx.userId }

  let savedId: string
  if (commitmentId) {
    if (!uuid.safeParse(commitmentId).success) return fail({ error: 'This commitment could not be found.' }, values)
    const { data, error } = await ctx.supabase
      .from('project_commitments')
      .update(row)
      .eq('id', commitmentId)
      .eq('project_id', projectId)
      .eq('status', 'draft')
      .is('source_quote_award_id', null)
      .select('id')
      .maybeSingle()
    if (error) return fail({ error: friendlyDbError(error) }, values)
    if (!data) return fail({ error: 'Only manual draft commitments can be edited. Refresh to see the latest status.', conflict: true }, values)
    savedId = data.id
  } else {
    const key = values.idempotency_key ?? ''
    if (!uuid.safeParse(key).success) return fail({ error: 'Something went wrong. Please try again.' }, values)
    const { data: existing } = await ctx.supabase.from('project_commitments').select('id').eq('idempotency_key', key).maybeSingle()
    if (existing) {
      savedId = existing.id
    } else {
      const { data, error } = await ctx.supabase
        .from('project_commitments')
        .insert({ ...row, organization_id: ctx.organizationId, project_id: projectId, status: 'draft', commitment_type: 'purchase_order', idempotency_key: key, created_by: ctx.userId })
        .select('id')
        .single()
      if (error) return fail({ error: friendlyDbError(error) }, values)
      savedId = data.id
    }
  }

  revalidatePath(financialsPath(projectId))
  if (intent === 'approve') {
    const approved = await approveCommitment(ctx, projectId, savedId)
    if (!approved.ok) return { savedId, warning: `Commitment saved as draft, but it could not be approved: ${approved.error}` }
    return { savedId, success: 'Commitment saved and approved' }
  }
  return { savedId, success: commitmentId ? 'Commitment updated' : 'Commitment saved as draft' }
}

async function approveCommitment(ctx: Ctx, projectId: string, commitmentId: string): Promise<Result> {
  const { data, error } = await ctx.supabase
    .from('project_commitments')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: ctx.userId, updated_by: ctx.userId })
    .eq('id', commitmentId)
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: friendlyDbError(error) }
  if (!data) return { ok: false, error: 'This commitment is no longer a draft.' }
  return { ok: true }
}

export async function approveCommitmentAction(projectId: string, commitmentId: string): Promise<Result> {
  const access = await costContext(projectId)
  if (!access.ok) return { ok: false, error: access.state.error ?? 'Not allowed.' }
  if (!uuid.safeParse(commitmentId).success) return { ok: false, error: 'This commitment could not be found.' }
  const result = await approveCommitment(access.ctx, projectId, commitmentId)
  revalidatePath(financialsPath(projectId))
  return result
}
