'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { generateText } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { friendlyDbError } from '@/lib/action-state'
import { requireClientUpdateProject, getClientUpdateCandidates } from '@/lib/client-updates-data'
import { getOrgToday } from '@/lib/daily-logs-data'
import { getAssistantProviderConfig } from '@/lib/ai/assistant-provider'
import {
  clientUpdateErrorMessage,
  clientUpdateFormSchema,
  clientUpdatesPath,
  daysBetween,
  type ClientUpdateForm,
} from '@/lib/client-updates'

export type ClientUpdateResult = { ok: true; version: number; message?: string } | { ok: false; error: string }

const uuid = z.uuid()

function dbError(error: { message?: string; code?: string } | null) {
  return clientUpdateErrorMessage(error) ?? friendlyDbError(error)
}

async function requireEditable(projectId: string) {
  if (!uuid.safeParse(projectId).success) return { error: 'This page is out of date. Reload and try again.' } as const
  const ctx = await requireClientUpdateProject(projectId)
  if (!ctx.canEdit) return { error: ctx.project.archived_at ? 'This project is archived; client updates are read-only.' : 'Only administrators and project managers can edit client updates.' } as const
  return { ctx } as const
}

export async function createClientUpdateAction(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '')
  const check = await requireEditable(projectId)
  if ('error' in check) redirect(`${clientUpdatesPath(projectId)}?error=permission`)
  const { session, project } = check.ctx
  const today = await getOrgToday(session.organizationId)
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('client_updates')
    .insert({ organization_id: session.organizationId, project_id: project.id, title: `Progress update — ${project.name}`.slice(0, 160), period_start: start, period_end: today })
    .select('id')
    .single()
  if (error || !data) redirect(`${clientUpdatesPath(project.id)}?error=create`)
  revalidatePath(clientUpdatesPath(project.id))
  redirect(`${clientUpdatesPath(project.id)}/${data.id}`)
}

/** Saves text, sources, and photos as one draft edit. Rejects the save if someone else changed the draft first. */
export async function saveClientUpdateAction(projectId: string, updateId: string, expectedVersion: number, input: ClientUpdateForm): Promise<ClientUpdateResult> {
  const check = await requireEditable(projectId)
  if ('error' in check) return { ok: false, error: check.error }
  if (!uuid.safeParse(updateId).success || !Number.isInteger(expectedVersion)) return { ok: false, error: 'This page is out of date. Reload and try again.' }
  const parsed = clientUpdateFormSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' }
  const v = parsed.data
  if (v.photos.filter((p) => p.is_cover).length > 1) return { ok: false, error: 'Choose only one cover photo.' }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('client_updates')
    .update({
      title: v.title,
      period_start: v.period_start,
      period_end: v.period_end,
      overview: v.overview,
      completed_work: v.completed_work,
      in_progress_work: v.in_progress_work,
      upcoming_work: v.upcoming_work,
      homeowner_message: v.homeowner_message,
      ai_assisted: v.ai_assisted,
    })
    .eq('id', updateId)
    .eq('project_id', projectId)
    .eq('version', expectedVersion)
    .select('id, organization_id')
  if (error) return { ok: false, error: dbError(error) }
  if (!updated?.length) return { ok: false, error: 'This update changed since you opened it. Reload to see the latest version.' }
  const organizationId = updated[0].organization_id as string

  const [{ data: curSources }, { data: curPhotos }] = await Promise.all([
    supabase.from('client_update_sources').select('id, source_type, source_id').eq('client_update_id', updateId),
    supabase.from('client_update_photos').select('id, source_type, source_id').eq('client_update_id', updateId),
  ])
  const key = (t: string, id: string) => `${t}:${id}`

  const wantSources = new Set(v.sources.map((s) => key(s.source_type, s.source_id)))
  const haveSources = new Map((curSources ?? []).map((s) => [key(s.source_type, s.source_id), s.id as string]))
  const dropSources = [...haveSources].filter(([k]) => !wantSources.has(k)).map(([, id]) => id)
  const addSources = v.sources.filter((s) => !haveSources.has(key(s.source_type, s.source_id)))

  const wantPhotos = new Set(v.photos.map((p) => key(p.source_type, p.source_id)))
  const havePhotos = new Map((curPhotos ?? []).map((p) => [key(p.source_type, p.source_id), p.id as string]))
  const dropPhotos = [...havePhotos].filter(([k]) => !wantPhotos.has(k)).map(([, id]) => id)

  if (dropSources.length) {
    const { error: e } = await supabase.from('client_update_sources').delete().in('id', dropSources)
    if (e) return { ok: false, error: dbError(e) }
  }
  if (addSources.length) {
    const { error: e } = await supabase.from('client_update_sources').insert(addSources.map((s) => ({ ...s, organization_id: organizationId, client_update_id: updateId })))
    if (e) return { ok: false, error: dbError(e) }
  }
  if (dropPhotos.length) {
    const { error: e } = await supabase.from('client_update_photos').delete().in('id', dropPhotos)
    if (e) return { ok: false, error: dbError(e) }
  }
  // Clear the cover first so the one-cover unique index never sees two at once while rows are rewritten.
  await supabase.from('client_update_photos').update({ is_cover: false }).eq('client_update_id', updateId).eq('is_cover', true)
  for (const [i, p] of v.photos.entries()) {
    const existing = havePhotos.get(key(p.source_type, p.source_id))
    const row = { caption: p.caption, sort_order: i, is_cover: p.is_cover }
    const { error: e } = existing
      ? await supabase.from('client_update_photos').update(row).eq('id', existing)
      : await supabase.from('client_update_photos').insert({
          ...row,
          organization_id: organizationId,
          client_update_id: updateId,
          source_type: p.source_type,
          source_id: p.source_id,
          // Overwritten by the database trigger from the source row; never trusted from the client.
          storage_path: 'pending',
        })
    if (e) return { ok: false, error: dbError(e) }
  }

  const { data: fresh } = await supabase.from('client_updates').select('version').eq('id', updateId).single()
  revalidatePath(clientUpdatesPath(projectId))
  return { ok: true, version: fresh?.version ?? expectedVersion + 1, message: 'Draft saved.' }
}

export async function publishClientUpdateAction(projectId: string, updateId: string, expectedVersion: number): Promise<ClientUpdateResult> {
  const check = await requireEditable(projectId)
  if ('error' in check) return { ok: false, error: check.error }
  if (!uuid.safeParse(updateId).success) return { ok: false, error: 'This page is out of date. Reload and try again.' }
  const supabase = await createClient()
  const { data: revision, error } = await supabase.rpc('publish_client_update', { p_update: updateId, p_expected_version: expectedVersion })
  if (error) return { ok: false, error: dbError(error) }
  revalidatePath(clientUpdatesPath(projectId))
  revalidatePath(`/portal/projects/${projectId}/updates`)
  return { ok: true, version: expectedVersion, message: revision > 1 ? `Revision ${revision} published to the homeowner portal.` : 'Published to the homeowner portal.' }
}

export async function deleteClientUpdateDraftAction(formData: FormData) {
  const projectId = String(formData.get('project_id') ?? '')
  const updateId = String(formData.get('update_id') ?? '')
  const check = await requireEditable(projectId)
  if ('error' in check || !uuid.safeParse(updateId).success) redirect(clientUpdatesPath(projectId))
  const supabase = await createClient()
  // RLS only allows deleting updates that were never published.
  await supabase.from('client_updates').delete().eq('id', updateId).eq('project_id', projectId).eq('revision', 0)
  revalidatePath(clientUpdatesPath(projectId))
  redirect(clientUpdatesPath(projectId))
}

const aiDraftSchema = z.object({
  overview: z.string().max(4000).nullable().optional(),
  completed_work: z.string().max(4000).nullable().optional(),
  in_progress_work: z.string().max(4000).nullable().optional(),
  upcoming_work: z.string().max(4000).nullable().optional(),
})

export type AiDraftResult = { ok: true; draft: z.infer<typeof aiDraftSchema> } | { ok: false; error: string }

/**
 * Drafts section text from the selected finalized daily logs and published schedule activities only.
 * Internal notes, delays' internal reasons, crews, and costs are never sent to the model. The builder reviews before saving.
 */
export async function draftClientUpdateWithAiAction(
  projectId: string,
  periodStart: string,
  periodEnd: string,
  selected: { source_type: 'daily_log' | 'schedule_activity'; source_id: string }[],
): Promise<AiDraftResult> {
  const check = await requireEditable(projectId)
  if ('error' in check) return { ok: false, error: check.error }
  if (!check.ctx.aiAvailable) return { ok: false, error: 'The AI assistant is turned off for your company.' }
  const provider = getAssistantProviderConfig()
  if (!provider.configured) return { ok: false, error: 'The AI assistant is not configured in this environment.' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || periodEnd < periodStart || daysBetween(periodStart, periodEnd) > 62) {
    return { ok: false, error: 'Choose a valid reporting period first.' }
  }

  const candidates = await getClientUpdateCandidates(projectId, periodStart, periodEnd)
  const pick = new Set(selected.map((s) => `${s.source_type}:${s.source_id}`))
  const logs = candidates.logs.filter((l) => pick.has(`daily_log:${l.id}`))
  const activities = candidates.activities.filter((a) => pick.has(`schedule_activity:${a.id}`))
  if (!logs.length && !activities.length) return { ok: false, error: 'Select at least one daily log or schedule activity to draft from.' }

  const facts = [
    ...logs.map((l) => `Daily log ${l.log_date}: work performed: ${l.work_performed ?? '—'}; progress: ${l.progress_notes ?? '—'}; planned next: ${l.work_planned_next ?? '—'}`),
    ...activities.map((a) => `Schedule activity "${a.name}"${a.phase ? ` (${a.phase})` : ''}: status ${a.status}, ${a.percent_complete ?? 0}% complete, planned ${a.planned_start ?? '?'} to ${a.planned_end ?? '?'}${a.public_note ? `; note: ${a.public_note}` : ''}`),
  ]
    .join('\n')
    .slice(0, 12000)

  try {
    const { text } = await generateText({
      model: provider.model,
      maxOutputTokens: 1200,
      system:
        'You write warm, plain-language construction progress updates for homeowners. Use ONLY the facts provided. Never invent dates, percentages, inspections, or problems. Do not mention costs, subcontractor names, crew sizes, or internal issues. Respond with a single JSON object with string keys overview, completed_work, in_progress_work, upcoming_work. Use short paragraphs or "- " bullet lines. Use null for any section without supporting facts.',
      prompt: `Reporting period ${periodStart} to ${periodEnd}.\nFacts:\n${facts}`,
    })
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const draft = aiDraftSchema.safeParse(JSON.parse(json))
    if (!draft.success) return { ok: false, error: 'The AI draft could not be read. Try again or write the update manually.' }
    return { ok: true, draft: draft.data }
  } catch (err) {
    console.error('[client-updates] ai draft failed', { message: err instanceof Error ? err.message : String(err) })
    return { ok: false, error: 'The AI draft could not be generated. Try again or write the update manually.' }
  }
}
