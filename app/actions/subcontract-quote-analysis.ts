'use server'

import { generateText, Output } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireManager } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { ASSISTANT_LIMITS, getAssistantProviderConfig } from '@/lib/ai/assistant-provider'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import { fingerprintOf, qualificationSnapshot } from '@/lib/subcontract-quote-analysis-data'
import {
  InvalidAnalysisError,
  QUOTE_ANALYSIS_MAX_QUOTES,
  QUOTE_ANALYSIS_SYSTEM,
  buildPrompt,
  buildSources,
  inputSnapshot,
  modelOutputSchema,
  validateAnalysis,
  type AnalysisInput,
  type AnalysisResult,
  type SavedAnalysis,
} from '@/lib/ai/quote-analysis'
import { REVISION_COLUMNS, isQuoteSetupError, type QuoteRevision, type ScopeDocument } from '@/lib/subcontract-quotes'

type AnalyzeResult =
  | { ok: true; analysis: SavedAnalysis; saved: boolean }
  | { ok: false; error: string; retryable: boolean }

const uuid = z.uuid()
const fail = (error: string, retryable = false): AnalyzeResult => ({ ok: false, error, retryable })

/**
 * Advisory only. Reads the builder's own request under RLS, sends the selected submitted revisions,
 * published scope, and qualification summaries to the model, validates the output against those
 * records, and stores it. It never selects, rejects, notifies, or edits anything.
 */
export async function analyzeQuotesAction(projectId: string, requestId: string, invitationIds: string[]): Promise<AnalyzeResult> {
  const session = await requireManager()
  const ids = [...new Set(invitationIds)]
  if (![projectId, requestId, ...ids].every((v) => uuid.safeParse(v).success)) return fail('Invalid request.')
  if (ids.length < 2 || ids.length > QUOTE_ANALYSIS_MAX_QUOTES) return fail(`Select between 2 and ${QUOTE_ANALYSIS_MAX_QUOTES} quotes to analyze.`)

  const features = await getOrgFeatures(session.organizationId)
  if (!features.subcontractors) return fail('Subcontractor quotes are turned off for your company.')
  if (!features.ai_assistant) return fail('AI assistance is turned off for your company. An administrator can enable it in Settings → Features.')
  const provider = getAssistantProviderConfig()
  if (!provider.configured) return fail('AI assistance is not configured in this environment (no AI Gateway credentials). The manual comparison still works.')

  const supabase = await createClient()
  const org = session.organizationId

  const { data: req } = await supabase
    .from('subcontract_quote_requests')
    .select('id, title, trade, status, currency, current_scope_version, work_window_start, work_window_end')
    .eq('id', requestId)
    .eq('project_id', projectId)
    .eq('organization_id', org)
    .maybeSingle()
  if (!req || req.status === 'draft') return fail('That quote request is not available.')

  const [inv, scope, revs] = await Promise.all([
    supabase
      .from('subcontract_quote_invitations')
      .select('id, subcontractor_company_id, status, revision_requested_at, company:subcontractor_companies(company_name)')
      .eq('request_id', requestId)
      .in('id', ids),
    supabase.from('subcontract_quote_scope_versions').select('version, scope, documents').eq('request_id', requestId).eq('version', req.current_scope_version).maybeSingle(),
    supabase.from('subcontract_quote_revisions').select(REVISION_COLUMNS).eq('request_id', requestId).in('invitation_id', ids).eq('status', 'submitted').order('revision_number', { ascending: false }),
  ])
  if (inv.error || revs.error || scope.error) return fail('The quotes could not be loaded. Try again.', true)

  type Inv = { id: string; subcontractor_company_id: string; status: string; revision_requested_at: string | null; company: { company_name: string } | null }
  const invitations = (inv.data ?? []) as unknown as Inv[]
  const revisions = (revs.data ?? []) as unknown as QuoteRevision[]
  if (invitations.length !== ids.length) return fail('One of the selected quotes is not part of this request.')

  const latest = new Map<string, QuoteRevision>()
  for (const r of revisions) if (!latest.has(r.invitation_id)) latest.set(r.invitation_id, r)
  if (invitations.some((i) => i.status === 'declined' || !latest.has(i.id))) return fail('Every selected company needs a submitted quote.')

  const revisionIds = [...latest.values()].map((r) => r.id)
  const [att, qual] = await Promise.all([
    supabase.from('subcontract_quote_attachments').select('id, revision_id, file_name').in('revision_id', revisionIds),
    loadQualificationSummaries(supabase, org, invitations.map((i) => i.subcontractor_company_id)),
  ])
  const attachments = (att.data ?? []) as { id: string; revision_id: string; file_name: string }[]
  const today = new Date().toISOString().slice(0, 10)
  const scopeRow = scope.data as { scope: string; documents: ScopeDocument[] } | null

  const ordered = ids.map((id) => invitations.find((i) => i.id === id)!)
  const input: AnalysisInput = {
    title: req.title,
    trade: req.trade,
    currency: req.currency,
    scopeVersion: req.current_scope_version,
    scopeText: scopeRow?.scope ?? '',
    scopeDocuments: (scopeRow?.documents ?? []).map((d) => ({ name: d.name, version_number: d.version_number })),
    workWindow: { start: req.work_window_start, end: req.work_window_end },
    quotes: ordered.map((i) => {
      const r = latest.get(i.id)!
      return {
        invitationId: i.id,
        company: i.company?.company_name ?? 'Company',
        revision: r,
        attachments: attachments.filter((a) => a.revision_id === r.id).map((a) => ({ id: a.id, file_name: a.file_name })),
        qualification: qualificationSnapshot(qual.byCompany[i.subcontractor_company_id]),
        outdatedScope: r.scope_version !== req.current_scope_version,
        expired: !!r.valid_until && r.valid_until < today,
        revisionOutstanding: !!i.revision_requested_at && (!r.submitted_at || i.revision_requested_at > r.submitted_at),
      }
    }),
  }

  const { data: usage } = await supabase.rpc('ai_assistant_usage', { p_org: org }).maybeSingle<{ user_last_hour: number; org_last_day: number }>()
  if (!usage) return fail('AI assistance is not available for your account.')
  if (usage.user_last_hour >= ASSISTANT_LIMITS.perUserPerHour) return fail('You have reached the hourly AI limit. Try again a little later.', true)
  if (usage.org_last_day >= ASSISTANT_LIMITS.perOrgPerDay) return fail('Your company has reached today’s AI limit. It resets within 24 hours.')
  const { error: logError } = await supabase.from('ai_assistant_requests').insert({ organization_id: org, user_id: session.userId, project_id: projectId })
  if (logError) return fail('AI assistance is not available for your account.')

  const sources = buildSources(input)
  let result: AnalysisResult
  try {
    const { output } = await generateText({
      model: provider.model,
      system: QUOTE_ANALYSIS_SYSTEM,
      prompt: buildPrompt(input, sources),
      output: Output.object({ schema: modelOutputSchema }),
      maxOutputTokens: 4000,
      abortSignal: AbortSignal.timeout(ASSISTANT_LIMITS.timeoutMs),
    })
    result = validateAnalysis(output, input, sources)
  } catch (err) {
    const name = err instanceof Error ? err.name : 'UnknownError'
    console.error('[quote-analysis] generation failed', { requestId, name })
    if (err instanceof InvalidAnalysisError) return fail(`${err.message} Nothing was saved. Try again.`, true)
    if (name === 'TimeoutError' || name === 'AbortError') return fail('The AI review took too long. Try again.', true)
    return fail('The AI review could not be generated. Try again, or continue with the manual comparison.', true)
  }

  const row = {
    organization_id: org,
    project_id: projectId,
    request_id: requestId,
    invitation_ids: ids,
    revision_ids: input.quotes.map((q) => q.revision.id),
    scope_version: input.scopeVersion,
    input_fingerprint: fingerprintOf(input),
    input_snapshot: inputSnapshot(input),
    model: provider.model,
    result,
    created_by: session.userId,
  }
  const { data: saved, error: saveError } = await supabase.from('subcontract_quote_ai_analyses').insert(row).select('id, created_at').single()
  if (saveError) {
    console.error('[quote-analysis] save failed', { requestId, code: saveError.code })
    if (!isQuoteSetupError(saveError)) return fail('The AI review could not be saved. Try again.', true)
  }
  return {
    ok: true,
    saved: !saveError,
    analysis: { id: saved?.id ?? null, createdAt: saved?.created_at ?? new Date().toISOString(), invitationIds: ids, result },
  }
}
