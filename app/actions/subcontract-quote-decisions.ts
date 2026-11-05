'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { quoteDbError } from '@/lib/subcontract-quotes'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const uuid = z.uuid()
const WARNING_KEYS = ['qualification', 'expired'] as const

function paths(projectId: string, requestId: string) {
  revalidatePath(`/projects/${projectId}/subcontractor-work/quotes`)
  revalidatePath(`/projects/${projectId}/subcontractor-work/quotes/${requestId}`)
}

function validIds(...values: string[]) {
  return values.every((v) => uuid.safeParse(v).success)
}

export async function addQuoteReviewNoteAction(
  projectId: string,
  requestId: string,
  invitationId: string,
  body: string,
  revisionId: string | null,
): Promise<Result> {
  const session = await requireManager()
  if (!validIds(projectId, requestId, invitationId) || (revisionId && !validIds(revisionId))) return { ok: false, error: 'Invalid request.' }
  const text = z.string().trim().min(1, 'Write a note first').max(4000).safeParse(body)
  if (!text.success) return { ok: false, error: text.error.issues[0]?.message ?? 'Invalid note.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_review_note_add', {
    p_invitation: invitationId,
    p_expected_org: session.organizationId,
    p_body: text.data,
    p_revision: revisionId,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  paths(projectId, requestId)
  return { ok: true }
}

export async function rejectQuoteAction(
  projectId: string,
  requestId: string,
  invitationId: string,
  message: string,
  internalNote: string,
): Promise<Result> {
  const session = await requireManager()
  if (!validIds(projectId, requestId, invitationId)) return { ok: false, error: 'Invalid request.' }
  const parsed = z
    .object({ message: z.string().trim().max(2000), note: z.string().trim().max(4000) })
    .safeParse({ message, note: internalNote })
  if (!parsed.success) return { ok: false, error: 'Text is too long.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_reject', {
    p_invitation: invitationId,
    p_expected_org: session.organizationId,
    p_message: parsed.data.message || null,
    p_internal_note: parsed.data.note || null,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  paths(projectId, requestId)
  return { ok: true }
}

export async function selectQuoteAction(
  projectId: string,
  requestId: string,
  revisionId: string,
  confirmed: boolean,
  acknowledged: string[],
): Promise<Result> {
  const session = await requireManager()
  if (!validIds(projectId, requestId, revisionId)) return { ok: false, error: 'Invalid request.' }
  const warnings = z.array(z.enum(WARNING_KEYS)).max(WARNING_KEYS.length).safeParse(acknowledged)
  if (!warnings.success) return { ok: false, error: 'Invalid acknowledgement.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_select', {
    p_request: requestId,
    p_expected_org: session.organizationId,
    p_revision: revisionId,
    p_confirmed: confirmed === true,
    p_acknowledged_warnings: warnings.data,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  paths(projectId, requestId)
  return { ok: true }
}

export async function createQuoteCommitmentAction(
  projectId: string,
  requestId: string,
  costCategory: string,
  description: string,
  amountCents: string,
): Promise<Result<{ commitmentId: string }>> {
  const session = await requireManager()
  if (!validIds(projectId, requestId)) return { ok: false, error: 'Invalid request.' }
  const parsed = z
    .object({
      category: z.string().trim().min(1, 'Choose a cost category').max(80),
      description: z.string().trim().min(2, 'Describe the commitment').max(500),
      amount: z.string().regex(/^\d{1,12}$/, 'Enter the agreed amount'),
    })
    .safeParse({ category: costCategory, description, amount: amountCents })
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the commitment details.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('quote_create_commitment', {
    p_request: requestId,
    p_expected_org: session.organizationId,
    p_cost_category: parsed.data.category,
    p_description: parsed.data.description,
    p_amount_cents: Number(parsed.data.amount),
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  paths(projectId, requestId)
  revalidatePath(`/projects/${projectId}/financials`)
  return { ok: true, commitmentId: (data as { commitment_id: string }).commitment_id }
}
