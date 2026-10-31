'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { canManage, getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { friendlyDbError } from '@/lib/action-state'
import {
  EVIDENCE_BUCKET,
  EVIDENCE_EXTENSIONS,
  MAX_EVIDENCE_BYTES,
  isQualificationSetupError,
} from '@/lib/subcontractor-qualification'

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

const SETUP_MESSAGE = 'Subcontractor vetting is not set up in this environment yet. No records were changed.'
const uuid = z.string().uuid()
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .optional()
  .or(z.literal('').transform(() => undefined))
const shortText = (max: number) => z.string().trim().max(max).optional()

async function managerContext() {
  const session = await getSession()
  if (!session?.organizationId || !canManage(session.role)) {
    return { ok: false as const, error: 'Only administrators and project managers can manage subcontractor vetting.' }
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.subcontractors) return { ok: false as const, error: 'The Subcontractors module is turned off.' }
  return { ok: true as const, session, supabase: await createClient() }
}

/** Database exceptions raised by the vetting functions are written for people; pass them through. */
function rpcError(error: { message?: string; code?: string }): string {
  if (isQualificationSetupError(error)) return SETUP_MESSAGE
  if (error.code === 'P0001' && error.message) return error.message
  return friendlyDbError(error)
}

function refresh(companyId: string) {
  revalidatePath(`/subcontractors/${companyId}`)
  revalidatePath('/subcontractors')
  revalidatePath('/dashboard')
}

export async function startVettingAction(companyId: string): Promise<Result<{ added: number }>> {
  if (!uuid.safeParse(companyId).success) return { ok: false, error: 'Subcontractor not found.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const { data, error } = await ctx.supabase.rpc('start_subcontractor_vetting', { p_company: companyId })
  if (error) return { ok: false, error: rpcError(error) }
  refresh(companyId)
  return { ok: true, data: { added: Number(data ?? 0) } }
}

const prepareSchema = z.object({
  companyId: uuid,
  itemId: uuid,
  contentType: z.string(),
  size: z.number().int().positive().max(MAX_EVIDENCE_BYTES, 'Files must be 25 MB or smaller.'),
})

export async function prepareEvidenceUpload(input: z.input<typeof prepareSchema>): Promise<Result<{ path: string }>> {
  const parsed = prepareSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid upload.' }
  const ext = EVIDENCE_EXTENSIONS[parsed.data.contentType]
  if (!ext) return { ok: false, error: 'Upload a PDF, PNG, JPEG, or WebP file.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const { data: item, error } = await ctx.supabase
    .from('subcontractor_qualification_items')
    .select('id')
    .eq('id', parsed.data.itemId)
    .eq('subcontractor_company_id', parsed.data.companyId)
    .eq('organization_id', ctx.session.organizationId!)
    .maybeSingle()
  if (error) return { ok: false, error: rpcError(error) }
  if (!item) return { ok: false, error: 'This checklist item was not found. Refresh the page and try again.' }
  return {
    ok: true,
    data: { path: `${ctx.session.organizationId}/${parsed.data.companyId}/${parsed.data.itemId}/${crypto.randomUUID()}.${ext}` },
  }
}

const registerSchema = z.object({
  companyId: uuid,
  path: z.string().max(300),
  originalFilename: z.string().trim().min(1).max(255),
  effectiveDate: isoDate,
  expirationDate: isoDate,
  referenceNumber: shortText(80),
  issuingAuthority: shortText(160),
  notes: shortText(2000),
})

export async function registerEvidenceAction(input: z.input<typeof registerSchema>): Promise<Result<{ versionNumber: number }>> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the evidence details.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const d = parsed.data
  if (!d.path.startsWith(`${ctx.session.organizationId}/${d.companyId}/`)) return { ok: false, error: 'Invalid upload path.' }
  const { data, error } = await ctx.supabase.rpc('register_qualification_evidence', {
    p_storage_path: d.path,
    p_original_filename: d.originalFilename,
    p_effective_date: d.effectiveDate ?? null,
    p_expiration_date: d.expirationDate ?? null,
    p_reference_number: d.referenceNumber || null,
    p_issuing_authority: d.issuingAuthority || null,
    p_notes: d.notes || null,
  })
  if (error) return { ok: false, error: rpcError(error) }
  refresh(d.companyId)
  return { ok: true, data: { versionNumber: Number((data as { version_number?: number } | null)?.version_number ?? 1) } }
}

/** Removes an uploaded object that never got registered (storage policy only allows unregistered, own uploads). */
export async function discardEvidenceUpload(path: string): Promise<Result> {
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  if (!path.startsWith(`${ctx.session.organizationId}/`)) return { ok: false, error: 'Invalid upload path.' }
  await ctx.supabase.storage.from(EVIDENCE_BUCKET).remove([path])
  return { ok: true, data: undefined }
}

export async function evidenceUrlAction(evidenceId: string): Promise<Result<{ url: string }>> {
  if (!uuid.safeParse(evidenceId).success) return { ok: false, error: 'File not found.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const { data: row, error } = await ctx.supabase
    .from('subcontractor_qualification_evidence')
    .select('storage_path, original_filename')
    .eq('id', evidenceId)
    .eq('organization_id', ctx.session.organizationId!)
    .maybeSingle()
  if (error) return { ok: false, error: rpcError(error) }
  if (!row) return { ok: false, error: 'This file is not available to you.' }
  const { data, error: signError } = await ctx.supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(row.storage_path, 60, { download: row.original_filename })
  if (signError || !data) return { ok: false, error: 'The file could not be opened. Try again.' }
  return { ok: true, data: { url: data.signedUrl } }
}

const reviewSchema = z.object({
  companyId: uuid,
  itemId: uuid,
  decision: z.enum(['verified', 'rejected', 'not_applicable', 'reopen']),
  reason: shortText(1000),
  notes: shortText(2000),
  effectiveDate: isoDate,
  expirationDate: isoDate,
  referenceNumber: shortText(80),
  issuingAuthority: shortText(160),
})

export async function reviewItemAction(input: z.input<typeof reviewSchema>): Promise<Result<{ state: string }>> {
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the review details.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const d = parsed.data
  const { data, error } = await ctx.supabase.rpc('review_qualification_item', {
    p_item: d.itemId,
    p_decision: d.decision,
    p_notes: d.notes || null,
    p_reason: d.reason || null,
    p_effective_date: d.effectiveDate ?? null,
    p_expiration_date: d.expirationDate ?? null,
    p_reference_number: d.referenceNumber || null,
    p_issuing_authority: d.issuingAuthority || null,
  })
  if (error) return { ok: false, error: rpcError(error) }
  refresh(d.companyId)
  return { ok: true, data: { state: String(data) } }
}

const noteSchema = z.object({ companyId: uuid, notes: shortText(2000) })

export async function requestDocumentsAction(input: z.input<typeof noteSchema>): Promise<Result> {
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request details.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const { error } = await ctx.supabase.rpc('request_subcontractor_documents', {
    p_company: parsed.data.companyId,
    p_notes: parsed.data.notes || null,
  })
  if (error) return { ok: false, error: rpcError(error) }
  refresh(parsed.data.companyId)
  return { ok: true, data: undefined }
}

export async function addVettingNoteAction(input: z.input<typeof noteSchema>): Promise<Result> {
  const parsed = noteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the note.' }
  if (!parsed.data.notes) return { ok: false, error: 'Enter a note.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  const { error } = await ctx.supabase.rpc('add_subcontractor_vetting_note', {
    p_company: parsed.data.companyId,
    p_notes: parsed.data.notes,
  })
  if (error) return { ok: false, error: rpcError(error) }
  refresh(parsed.data.companyId)
  return { ok: true, data: undefined }
}

const decisionSchema = z.object({
  companyId: uuid,
  outcome: z.enum(['approved', 'conditional', 'not_cleared']),
  notes: shortText(2000),
})

export async function decideQualificationAction(input: z.input<typeof decisionSchema>): Promise<Result<{ status: string }>> {
  const parsed = decisionSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the decision details.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  if (ctx.session.role !== 'org_admin') return { ok: false, error: 'Only administrators can record a final qualification decision.' }
  const { data, error } = await ctx.supabase.rpc('decide_subcontractor_qualification', {
    p_company: parsed.data.companyId,
    p_outcome: parsed.data.outcome,
    p_notes: parsed.data.notes || null,
  })
  if (error) return { ok: false, error: rpcError(error) }
  refresh(parsed.data.companyId)
  return { ok: true, data: { status: String(data) } }
}

export async function setAssignmentModeAction(mode: 'advisory' | 'enforcement'): Promise<Result> {
  if (mode !== 'advisory' && mode !== 'enforcement') return { ok: false, error: 'Unknown assignment mode.' }
  const ctx = await managerContext()
  if (!ctx.ok) return ctx
  if (ctx.session.role !== 'org_admin') return { ok: false, error: 'Only administrators can change the assignment mode.' }
  const { error } = await ctx.supabase.rpc('set_subcontractor_qualification_mode', {
    p_organization_id: ctx.session.organizationId,
    p_mode: mode,
  })
  if (error) return { ok: false, error: rpcError(error) }
  revalidatePath('/subcontractors', 'layout')
  return { ok: true, data: undefined }
}
