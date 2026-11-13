'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin, requireManager } from '@/lib/session'
import { getEstimate } from '@/lib/estimate-queries'
import { isEditableStatus } from '@/lib/estimates'
import { proposalInputSchema, templateInputSchema, type ProposalInput, type TemplateInput } from '@/lib/proposals'

type Result = { ok: true } | { ok: false; error: string }

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? 'Check the highlighted fields.'

export async function saveEstimateProposal(estimateId: string, input: ProposalInput): Promise<Result> {
  const session = await requireManager()
  if (!z.uuid().safeParse(estimateId).success) return { ok: false, error: 'Estimate not found.' }
  const parsed = proposalInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const estimate = await getEstimate(estimateId, session.organizationId)
  if (!estimate) return { ok: false, error: 'Estimate not found.' }
  if (!isEditableStatus(estimate.status)) {
    return { ok: false, error: 'This proposal is locked because the estimate was sent to the homeowner. Create a revision to change it.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('estimate_proposals')
    .upsert({ estimate_id: estimateId, organization_id: session.organizationId, ...parsed.data }, { onConflict: 'estimate_id' })
  if (error) {
    console.error('[proposals] save failed', error.message)
    return { ok: false, error: error.message.includes('locked') ? error.message : 'Could not save the proposal. Please try again.' }
  }
  revalidatePath(`/estimates/${estimateId}/proposal`)
  revalidatePath(`/estimates/${estimateId}`)
  return { ok: true }
}

export async function saveProposalTemplate(templateId: string | null, input: TemplateInput): Promise<Result & { id?: string }> {
  const session = await requireAdmin()
  if (templateId && !z.uuid().safeParse(templateId).success) return { ok: false, error: 'Template not found.' }
  const parsed = templateInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const query = templateId
    ? supabase.from('proposal_templates').update(parsed.data).eq('id', templateId).eq('organization_id', session.organizationId)
    : supabase.from('proposal_templates').insert({ ...parsed.data, organization_id: session.organizationId })
  const { data, error } = await query.select('id').single()
  if (error || !data) {
    console.error('[proposals] template save failed', error?.message)
    return { ok: false, error: 'Could not save the template. Please try again.' }
  }
  revalidatePath('/settings/proposal-templates')
  return { ok: true, id: data.id }
}

export type TemplateStateChange = 'default' | 'archive' | 'restore' | 'publish' | 'unpublish'

const TEMPLATE_COPY_COLUMNS = 'name, pricing_display, introduction, exclusions, payment_terms, terms, acceptance_text'

/** Copies a template as a new draft so it can be reworked without touching the published original. */
export async function duplicateProposalTemplate(templateId: string): Promise<Result & { id?: string }> {
  const session = await requireAdmin()
  if (!z.uuid().safeParse(templateId).success) return { ok: false, error: 'Template not found.' }
  const supabase = await createClient()
  const { data: source } = await supabase
    .from('proposal_templates')
    .select(TEMPLATE_COPY_COLUMNS)
    .eq('id', templateId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!source) return { ok: false, error: 'Template not found.' }
  const name = `${source.name} (copy)`.slice(0, 120)
  const { data, error } = await supabase
    .from('proposal_templates')
    .insert({ ...source, name, organization_id: session.organizationId, published_at: null })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[proposals] template duplicate failed', error?.message)
    return { ok: false, error: 'Could not duplicate the template.' }
  }
  revalidatePath('/settings/proposal-templates')
  return { ok: true, id: data.id }
}

export async function setProposalTemplateState(templateId: string, change: TemplateStateChange): Promise<Result> {
  const session = await requireAdmin()
  if (!z.uuid().safeParse(templateId).success) return { ok: false, error: 'Template not found.' }
  const supabase = await createClient()
  const org = session.organizationId

  if (change === 'default') {
    // Clear the current default first; the partial unique index allows one default per organization.
    const { error: clearError } = await supabase
      .from('proposal_templates')
      .update({ is_default: false })
      .eq('organization_id', org)
      .eq('is_default', true)
      .neq('id', templateId)
    if (clearError) return { ok: false, error: 'Could not change the default template.' }
    const { error } = await supabase
      .from('proposal_templates')
      .update({ is_default: true })
      .eq('id', templateId)
      .eq('organization_id', org)
      .is('archived_at', null)
      .not('published_at', 'is', null)
    if (error) return { ok: false, error: 'Could not change the default template.' }
  } else if (change === 'publish' || change === 'unpublish') {
    // Proposals copy template content when applied, so unpublishing never alters an existing document.
    const { error } = await supabase
      .from('proposal_templates')
      .update({ published_at: change === 'publish' ? new Date().toISOString() : null })
      .eq('id', templateId)
      .eq('organization_id', org)
      .is('archived_at', null)
    if (error) return { ok: false, error: 'Could not update the template.' }
  } else {
    const { error } = await supabase
      .from('proposal_templates')
      // Restored templates come back as drafts so they get a review before reaching proposals again.
      .update(change === 'archive' ? { archived_at: new Date().toISOString() } : { archived_at: null, published_at: null })
      .eq('id', templateId)
      .eq('organization_id', org)
    if (error) return { ok: false, error: 'Could not update the template.' }
  }
  revalidatePath('/settings/proposal-templates')
  return { ok: true }
}
