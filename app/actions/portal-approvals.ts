'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/session'
import { friendlyDbError, type ActionState } from '@/lib/action-state'
import { APPROVAL_DECISIONS, APPROVAL_DOCUMENT_TYPES, approvalHref } from '@/lib/portal-approvals'

const decisionSchema = z
  .object({
    type: z.enum(APPROVAL_DOCUMENT_TYPES),
    id: z.uuid(),
    revision: z.coerce.number().int().positive(),
    decision: z.enum(APPROVAL_DECISIONS, 'Choose approve, request changes, or decline'),
    comment: z.string().trim().max(2000, 'Comments are limited to 2,000 characters').optional(),
    expected_amount: z.coerce.number().int(),
    acknowledged: z.literal('on').optional(),
    request_key: z.uuid(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'changes_requested' && !v.comment) {
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'Describe the changes you would like' })
    }
    if (v.decision === 'approved' && v.acknowledged !== 'on') {
      ctx.addIssue({ code: 'custom', path: ['acknowledged'], message: 'Confirm you have reviewed this document' })
    }
  })

export async function decidePortalApprovalAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { error: 'Your session expired. Sign in again.', authRequired: true }
  if (session.role !== 'client') return { error: 'Only homeowners can record portal decisions.' }

  const parsed = decisionSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: Object.values(fieldErrors)[0] ?? 'Please check your decision.', fieldErrors }
  }
  const v = parsed.data

  const supabase = await createClient()
  const { error } = await supabase.rpc('portal_decide_approval', {
    p_type: v.type,
    p_id: v.id,
    p_revision: v.revision,
    p_decision: v.decision,
    p_comment: v.comment ?? null,
    p_expected_amount_cents: v.expected_amount,
    p_acknowledged: v.acknowledged === 'on',
    p_request_key: v.request_key,
  })
  if (error) return { error: friendlyDbError(error), conflict: /refresh/i.test(error.message ?? '') }

  revalidatePath('/portal')
  revalidatePath('/portal/approvals')
  revalidatePath(approvalHref(v.type, v.id))
  const messages = {
    approved: 'Approved. Your builder has been notified.',
    changes_requested: 'Your requested changes were sent to your builder.',
    rejected: 'Declined. Your builder has been notified.',
  } as const
  return { success: messages[v.decision] }
}
