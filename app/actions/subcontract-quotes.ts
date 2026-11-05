'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireManager } from '@/lib/session'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { loadQualificationSummaries } from '@/lib/subcontractor-qualification-data'
import { assignmentWarning } from '@/lib/subcontractor-qualification'
import { DOCUMENTS_BUCKET } from '@/lib/documents'
import {
  QUOTES_BUCKET,
  QUOTE_TIMEZONES,
  SUPPORTED_CURRENCIES,
  parseMoneyToCents,
  quoteDbError,
  zonedLocalToIso,
} from '@/lib/subcontract-quotes'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

const uuid = z.uuid()
const ids = z.array(z.uuid()).max(100)

function builderPaths(projectId: string, requestId?: string) {
  revalidatePath(`/projects/${projectId}/subcontractor-work/quotes`)
  if (requestId) revalidatePath(`/projects/${projectId}/subcontractor-work/quotes/${requestId}`)
}

function deadlineIso(local: string, tz: string): string | null | 'invalid' {
  if (!local) return null
  if (!(QUOTE_TIMEZONES as readonly string[]).includes(tz)) return 'invalid'
  return zonedLocalToIso(local, tz) ?? 'invalid'
}

/** Same rule as schedule assignments: enforcement mode blocks companies that are not Qualified. */
async function blockedCompanies(organizationId: string, companyIds: string[]): Promise<string | null> {
  if (!companyIds.length) return null
  const supabase = await createClient()
  const q = await loadQualificationSummaries(supabase, organizationId, companyIds)
  if (q.availability !== 'ready') return null
  for (const id of companyIds) {
    const warning = assignmentWarning(q.byCompany[id] ?? null, q.mode)
    if (warning?.level === 'block') return warning.message
  }
  return null
}

// ───────────────────────── Builder ─────────────────────────

const draftSchema = z.object({
  title: z.string().trim().min(1, 'Add a title').max(160),
  trade: z.string().trim().max(80),
  scope: z.string().max(20000),
  document_ids: ids,
  company_ids: ids,
  deadline_local: z.string().max(16),
  deadline_timezone: z.string().max(64),
  cost_category: z.string().trim().max(80),
  schedule_activity_id: z.string(),
  work_window_start: z.string().max(10),
  work_window_end: z.string().max(10),
})
export type DraftInput = z.infer<typeof draftSchema>

export async function saveQuoteRequestDraftAction(
  projectId: string,
  requestId: string | null,
  expectedVersion: number | null,
  input: DraftInput,
): Promise<Result<{ id: string; rowVersion: number }>> {
  const session = await requireManager()
  const parsed = draftSchema.safeParse(input)
  if (!uuid.safeParse(projectId).success || (requestId && !uuid.safeParse(requestId).success)) return { ok: false, error: 'Invalid request.' }
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  const d = parsed.data
  const deadline = deadlineIso(d.deadline_local, d.deadline_timezone)
  if (deadline === 'invalid') return { ok: false, error: 'Choose a valid deadline and timezone.' }
  if (d.work_window_start && d.work_window_end && d.work_window_end < d.work_window_start) {
    return { ok: false, error: 'The work window ends before it starts.' }
  }
  const blocked = await blockedCompanies(session.organizationId, d.company_ids)
  if (blocked) return { ok: false, error: blocked }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('quote_request_save', {
    p_request: requestId,
    p_project: projectId,
    p_expected_org: session.organizationId,
    p_expected_version: expectedVersion,
    p_payload: {
      title: d.title,
      trade: d.trade,
      scope: d.scope,
      document_ids: d.document_ids,
      company_ids: d.company_ids,
      response_deadline: deadline ?? '',
      deadline_timezone: d.deadline_timezone,
      cost_category: d.cost_category,
      schedule_activity_id: d.schedule_activity_id,
      work_window_start: d.work_window_start,
      work_window_end: d.work_window_end,
    },
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  const r = data as { id: string; row_version: number }
  builderPaths(projectId, r.id)
  return { ok: true, id: r.id, rowVersion: r.row_version }
}

export async function sendQuoteRequestAction(projectId: string, requestId: string, expectedVersion: number): Promise<Result> {
  const session = await requireManager()
  if (!uuid.safeParse(requestId).success) return { ok: false, error: 'Invalid request.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_request_send', {
    p_request: requestId,
    p_expected_org: session.organizationId,
    p_expected_version: expectedVersion,
    p_confirmed: true,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  builderPaths(projectId, requestId)
  return { ok: true }
}

export async function setProjectCurrencyAction(projectId: string, currency: string): Promise<Result> {
  const session = await requireManager()
  if (!uuid.safeParse(projectId).success || !(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) {
    return { ok: false, error: 'Choose a valid currency.' }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_project_currency', {
    p_project: projectId,
    p_expected_org: session.organizationId,
    p_currency: currency,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  builderPaths(projectId)
  return { ok: true }
}

export async function inviteQuoteCompaniesAction(projectId: string, requestId: string, companyIds: string[]): Promise<Result<{ added: number }>> {
  const session = await requireManager()
  if (!uuid.safeParse(requestId).success || !ids.safeParse(companyIds).success || !companyIds.length) {
    return { ok: false, error: 'Choose at least one company.' }
  }
  const blocked = await blockedCompanies(session.organizationId, companyIds)
  if (blocked) return { ok: false, error: blocked }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('quote_request_invite', {
    p_request: requestId,
    p_expected_org: session.organizationId,
    p_company_ids: companyIds,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  builderPaths(projectId, requestId)
  return { ok: true, added: Number(data ?? 0) }
}

export async function amendQuoteScopeAction(
  projectId: string,
  requestId: string,
  expectedVersion: number,
  scope: string,
  documentIds: string[],
  summary: string,
): Promise<Result> {
  const session = await requireManager()
  if (!uuid.safeParse(requestId).success || !ids.safeParse(documentIds).success) return { ok: false, error: 'Invalid request.' }
  if (!scope.trim()) return { ok: false, error: 'Describe the scope of work.' }
  if (!summary.trim()) return { ok: false, error: 'Summarize what changed for invitees.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_request_amend', {
    p_request: requestId,
    p_expected_org: session.organizationId,
    p_expected_version: expectedVersion,
    p_scope: scope.slice(0, 20000),
    p_document_ids: documentIds,
    p_summary: summary.slice(0, 2000),
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  builderPaths(projectId, requestId)
  return { ok: true }
}

export async function transitionQuoteRequestAction(
  projectId: string,
  requestId: string,
  expectedVersion: number,
  action: 'close' | 'reopen' | 'cancel' | 'extend',
  deadlineLocal?: string,
  timezone?: string,
): Promise<Result> {
  const session = await requireManager()
  if (!uuid.safeParse(requestId).success || !['close', 'reopen', 'cancel', 'extend'].includes(action)) {
    return { ok: false, error: 'Invalid request.' }
  }
  let deadline: string | null = null
  if (deadlineLocal) {
    const iso = deadlineIso(deadlineLocal, timezone ?? '')
    if (iso === 'invalid' || !iso) return { ok: false, error: 'Choose a valid deadline and timezone.' }
    deadline = iso
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_request_transition', {
    p_request: requestId,
    p_expected_org: session.organizationId,
    p_expected_version: expectedVersion,
    p_action: action,
    p_deadline: deadline,
    p_timezone: deadline ? timezone : null,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  builderPaths(projectId, requestId)
  return { ok: true }
}

export async function requestQuoteRevisionAction(projectId: string, requestId: string, invitationId: string, instructions: string): Promise<Result> {
  const session = await requireManager()
  if (!uuid.safeParse(invitationId).success) return { ok: false, error: 'Invalid request.' }
  if (instructions.trim().length < 5) return { ok: false, error: 'Write specific revision instructions.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_request_revision', {
    p_invitation: invitationId,
    p_expected_org: session.organizationId,
    p_instructions: instructions.slice(0, 4000),
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  builderPaths(projectId, requestId)
  return { ok: true }
}

/** Storage RLS decides: the company always, builders only once the file is part of a submitted revision. */
export async function getQuoteAttachmentUrlAction(path: string): Promise<Result<{ url: string }>> {
  if (typeof path !== 'string' || path.length > 500) return { ok: false, error: 'Invalid file.' }
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(QUOTES_BUCKET).createSignedUrl(path, 60)
  if (error || !data) return { ok: false, error: 'This file is not available.' }
  return { ok: true, url: data.signedUrl }
}

// ───────────────────────── Subcontractor ─────────────────────────

const alternateSchema = z.object({ description: z.string().trim().min(1).max(500), amount: z.string().max(20) })
const quoteSchema = z.object({
  amount: z.string().max(20),
  tax_treatment: z.enum(['', 'included', 'excluded', 'not_applicable']),
  tax_amount: z.string().max(20),
  tax_details: z.string().max(1000),
  inclusions: z.string().max(10000),
  exclusions: z.string().max(10000),
  availability: z.string().max(1000),
  allowances: z.string().max(5000),
  assumptions: z.string().max(5000),
  alternates: z.array(alternateSchema).max(25),
  estimated_duration_days: z.string().regex(/^\d{0,4}$/, 'Duration must be a whole number of days'),
  valid_until: z.string().max(10),
})
export type QuoteInput = z.infer<typeof quoteSchema>

export async function saveQuoteDraftAction(
  requestId: string,
  invitationId: string,
  expectedRowVersion: number | null,
  input: QuoteInput,
): Promise<Result<{ revisionId: string; rowVersion: number; revisionNumber: number }>> {
  await requireSubcontractor()
  if (!uuid.safeParse(invitationId).success) return { ok: false, error: 'Invalid request.' }
  const parsed = quoteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  const q = parsed.data
  const amount = parseMoneyToCents(q.amount)
  const tax = q.tax_treatment === 'excluded' ? parseMoneyToCents(q.tax_amount) : null
  if (amount === 'invalid') return { ok: false, error: 'Enter the amount as a number, for example 24500.00.' }
  if (tax === 'invalid') return { ok: false, error: 'Enter the tax amount as a number, or leave it blank if unknown.' }
  const alternates = []
  for (const a of q.alternates) {
    const cents = parseMoneyToCents(a.amount)
    if (cents === 'invalid') return { ok: false, error: `Enter a valid amount for the alternate "${a.description}".` }
    alternates.push({ description: a.description, amount_cents: cents })
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('quote_draft_save', {
    p_invitation: invitationId,
    p_expected_row_version: expectedRowVersion,
    p_payload: {
      amount_cents: amount ?? '',
      tax_treatment: q.tax_treatment,
      tax_amount_cents: tax ?? '',
      tax_details: q.tax_details,
      inclusions: q.inclusions,
      exclusions: q.exclusions,
      availability: q.availability,
      allowances: q.allowances,
      assumptions: q.assumptions,
      alternates,
      estimated_duration_days: q.estimated_duration_days,
      valid_until: q.valid_until,
    },
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  const r = data as { revision_id: string; row_version: number; revision_number: number }
  revalidatePath(`/sub/quotes/${requestId}`)
  return { ok: true, revisionId: r.revision_id, rowVersion: r.row_version, revisionNumber: r.revision_number }
}

export async function submitQuoteAction(
  requestId: string,
  revisionId: string,
  rowVersion: number,
  idempotencyKey: string,
  ackScopeVersion: number,
): Promise<Result<{ revisionNumber: number }>> {
  await requireSubcontractor()
  if (!uuid.safeParse(revisionId).success || !uuid.safeParse(idempotencyKey).success) return { ok: false, error: 'Invalid request.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('quote_submit', {
    p_revision: revisionId,
    p_expected_row_version: rowVersion,
    p_idempotency_key: idempotencyKey,
    p_ack_scope_version: ackScopeVersion,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  revalidatePath('/sub/quotes')
  revalidatePath(`/sub/quotes/${requestId}`)
  return { ok: true, revisionNumber: (data as { revision_number: number }).revision_number }
}

export async function declineQuoteAction(requestId: string, invitationId: string, reason: string): Promise<Result> {
  await requireSubcontractor()
  if (!uuid.safeParse(invitationId).success) return { ok: false, error: 'Invalid request.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_decline', { p_invitation: invitationId, p_reason: reason.slice(0, 2000) })
  if (error) return { ok: false, error: quoteDbError(error) }
  revalidatePath('/sub/quotes')
  revalidatePath(`/sub/quotes/${requestId}`)
  return { ok: true }
}

const fileSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  type: z.string().max(120),
  size: z.number().int().positive().max(25 * 1024 * 1024),
})

export async function registerQuoteAttachmentAction(
  requestId: string,
  revisionId: string,
  file: z.infer<typeof fileSchema>,
): Promise<Result<{ id: string }>> {
  await requireSubcontractor()
  const parsed = fileSchema.safeParse(file)
  if (!uuid.safeParse(revisionId).success || !parsed.success) return { ok: false, error: 'Invalid upload.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('quote_attachment_register', {
    p_revision: revisionId,
    p_path: parsed.data.path,
    p_file_name: parsed.data.name,
    p_content_type: parsed.data.type || null,
    p_size: parsed.data.size,
  })
  if (error) return { ok: false, error: quoteDbError(error) }
  revalidatePath(`/sub/quotes/${requestId}`)
  return { ok: true, id: data as string }
}

export async function removeQuoteAttachmentAction(requestId: string, attachmentId: string): Promise<Result> {
  await requireSubcontractor()
  if (!uuid.safeParse(attachmentId).success) return { ok: false, error: 'Invalid file.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('quote_attachment_remove', { p_attachment: attachmentId })
  if (error) return { ok: false, error: quoteDbError(error) }
  revalidatePath(`/sub/quotes/${requestId}`)
  return { ok: true }
}

/** Invitees cannot read project documents; the database confirms this exact version was issued to their company. */
export async function getQuoteDocumentUrlAction(requestId: string, versionId: string): Promise<Result<{ url: string }>> {
  await requireSubcontractor()
  if (!uuid.safeParse(requestId).success || !uuid.safeParse(versionId).success) return { ok: false, error: 'Invalid document.' }
  const supabase = await createClient()
  const { data: path, error } = await supabase.rpc('sub_quote_document_path', { p_request: requestId, p_version_id: versionId })
  if (error || !path) return { ok: false, error: 'This document is not available.' }
  const { data } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).createSignedUrl(path as string, 60)
  if (!data) return { ok: false, error: 'This document is not available.' }
  return { ok: true, url: data.signedUrl }
}
