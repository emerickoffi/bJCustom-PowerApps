'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, canManage } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { friendlyDbError } from '@/lib/action-state'
import { calculateDraft, composeNotes, draftSchema, toLineItemRows } from '@/lib/ai/estimate-draft'

const inputSchema = z.object({
  projectId: z.uuid(),
  creationKey: z.uuid(),
  draft: draftSchema,
})

export type AssistantEstimateResult =
  | { ok: true; estimateId: string; estimateNumber: string; projectName: string; href: string; alreadyExisted: boolean }
  | { ok: false; error: string }

/**
 * Saves an assistant-proposed estimate as a draft. Totals are recalculated here and
 * by the database triggers; nothing from the AI is trusted as an amount. The creation
 * key makes repeat clicks and retries return the same estimate.
 */
export async function createAssistantEstimateDraftAction(input: unknown): Promise<AssistantEstimateResult> {
  const session = await getSession()
  if (!session?.organizationId || !canManage(session.role)) {
    return { ok: false, error: 'Only managers can create estimates.' }
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.estimates) return { ok: false, error: 'Estimates are turned off for your company.' }

  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Some estimate details are invalid. Check the draft and try again.' }
  }
  const { projectId, creationKey, draft } = parsed.data

  const supabase = await createClient()
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, project_number')
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (projectError) return { ok: false, error: 'The project could not be checked right now. Try again.' }
  if (!project) return { ok: false, error: 'That project is not available to you.' }

  const calc = calculateDraft(draft, { id: project.id, name: project.name, number: project.project_number })
  const blocking = calc.issues.find((i) => i.level === 'block')
  if (blocking) return { ok: false, error: blocking.message }

  const { data, error } = await supabase
    .rpc('create_estimate_draft_with_items', {
      p_project: project.id,
      p_name: draft.title,
      p_description: draft.description,
      p_markup_percent: Number(calc.markupPercent),
      p_notes: composeNotes(draft) || null,
      p_items: toLineItemRows(draft),
      p_creation_key: creationKey,
      p_estimate_date: draft.estimate_date,
      p_expiration_date: draft.expiration_date,
    })
    .single<{ new_estimate_id: string; new_estimate_number: string; was_created: boolean }>()
  if (error || !data) {
    console.error('[assistant-estimate] create failed', { code: error?.code, message: error?.message })
    return { ok: false, error: error ? friendlyDbError(error) : 'The estimate could not be created. Try again.' }
  }

  revalidatePath('/estimates')
  revalidatePath(`/estimates/${data.new_estimate_id}`)
  revalidatePath(`/projects/${project.id}`, 'layout')

  return {
    ok: true,
    estimateId: data.new_estimate_id,
    estimateNumber: data.new_estimate_number,
    projectName: project.name,
    href: `/estimates/${data.new_estimate_id}`,
    alreadyExisted: !data.was_created,
  }
}
