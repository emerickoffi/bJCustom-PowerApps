'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/session'
import { DOCUMENTS_BUCKET } from '@/lib/documents'
import { RFIS_BUCKET, RFI_MAX_FILES, RFI_MAX_FILE_BYTES, isRfiConflict, rfiDbError, rfiFileType } from '@/lib/rfis'

/**
 * Every write goes through a database function that re-checks the caller, the project, the feature switch,
 * the status, and the row version. These actions validate shape, pass the caller's own session to the database,
 * and never use elevated credentials to write.
 */
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string; conflict?: boolean }
type Saved = { id: string; rowVersion: number; status: string; rfiNumber: number | null; replayed: boolean }

const uuid = z.uuid()
const SIGN_IN = 'Your session has ended. Sign in again, then retry. What you typed is still here.'

type DbError = { code?: string; message?: string }
const fail = (error: DbError | null): { ok: false; error: string; conflict?: boolean } => ({
  ok: false,
  error: rfiDbError(error),
  ...(isRfiConflict(error) ? { conflict: true } : {}),
})

function saved(data: unknown): Saved {
  const r = data as { id: string; row_version: number; status: string; rfi_number: number | null; replayed?: boolean }
  return { id: r.id, rowVersion: r.row_version, status: r.status, rfiNumber: r.rfi_number, replayed: Boolean(r.replayed) }
}

/** Staff and external responders share the answer, comment, and file actions; the database decides what each may do. */
async function signedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? supabase : null
}

function refresh(projectId: string, rfiId: string) {
  if (uuid.safeParse(projectId).success) revalidatePath(`/projects/${projectId}/rfis`)
  revalidatePath('/sub')
  revalidatePath('/sub/questions')
  revalidatePath(`/sub/questions/${rfiId}`)
}

const draftSchema = z.object({
  subject: z.string().trim().min(1, 'Add a subject.').max(200, 'Keep the subject under 200 characters.'),
  question: z.string().max(10000, 'Keep the question under 10,000 characters.'),
  responder_user_id: z.union([z.literal(''), z.uuid()]),
  due_date: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid due date.')]),
  location: z.string().trim().max(300, 'Keep the location under 300 characters.'),
  document_version_id: z.union([z.literal(''), z.uuid()]),
})

// ───────────────────────── Requester ─────────────────────────

export async function saveRfiDraftAction(
  projectId: string,
  rfiId: string,
  expectedVersion: number | null,
  input: z.input<typeof draftSchema>,
): Promise<Result<Saved>> {
  await requireStaff()
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(rfiId).success) return { ok: false, error: 'Choose a project first.' }
  const parsed = draftSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rfi_save_draft', {
    p_rfi: rfiId,
    p_project: projectId,
    p_expected_version: expectedVersion,
    p_payload: parsed.data,
  })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, ...saved(data) }
}

export async function sendRfiAction(projectId: string, rfiId: string, expectedVersion: number, requestId: string): Promise<Result<Saved>> {
  await requireStaff()
  if (!uuid.safeParse(rfiId).success || !uuid.safeParse(requestId).success) return { ok: false, error: 'Invalid request.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rfi_send', { p_rfi: rfiId, p_expected_version: expectedVersion, p_request: requestId })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, ...saved(data) }
}

const amendSchema = draftSchema.pick({ subject: true, question: true, due_date: true, location: true })

export async function amendRfiAction(
  projectId: string,
  rfiId: string,
  expectedVersion: number,
  input: z.input<typeof amendSchema>,
  note: string,
  requestId: string,
): Promise<Result<Saved>> {
  await requireStaff()
  if (!uuid.safeParse(rfiId).success || !uuid.safeParse(requestId).success) return { ok: false, error: 'Invalid request.' }
  const parsed = amendSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rfi_amend', {
    p_rfi: rfiId,
    p_expected_version: expectedVersion,
    p_payload: parsed.data,
    p_note: note.slice(0, 2000),
    p_request: requestId,
  })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, ...saved(data) }
}

export async function reassignRfiAction(
  projectId: string,
  rfiId: string,
  expectedVersion: number,
  responderUserId: string,
  note: string,
  requestId: string,
): Promise<Result<Saved>> {
  await requireStaff()
  if (!uuid.safeParse(rfiId).success || !uuid.safeParse(requestId).success) return { ok: false, error: 'Invalid request.' }
  if (!uuid.safeParse(responderUserId).success) return { ok: false, error: 'Choose a responder who can sign in to this project.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rfi_reassign', {
    p_rfi: rfiId,
    p_expected_version: expectedVersion,
    p_responder: responderUserId,
    p_note: note.slice(0, 2000),
    p_request: requestId,
  })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, ...saved(data) }
}

export async function transitionRfiAction(
  projectId: string,
  rfiId: string,
  expectedVersion: number,
  action: 'close' | 'reopen',
  reason: string,
  requestId: string,
): Promise<Result<Saved>> {
  await requireStaff()
  if (!uuid.safeParse(rfiId).success || !uuid.safeParse(requestId).success || !['close', 'reopen'].includes(action)) {
    return { ok: false, error: 'Invalid request.' }
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rfi_transition', {
    p_rfi: rfiId,
    p_expected_version: expectedVersion,
    p_action: action,
    p_reason: reason.slice(0, 2000),
    p_request: requestId,
  })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, ...saved(data) }
}

export async function setRfiHomeownerSharedAction(projectId: string, rfiId: string, shared: boolean): Promise<Result> {
  await requireStaff()
  if (!uuid.safeParse(rfiId).success) return { ok: false, error: 'Invalid request.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('rfi_set_homeowner_shared', { p_rfi: rfiId, p_shared: shared })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  revalidatePath('/portal')
  return { ok: true }
}

const fileSchema = z.object({
  path: z.string().min(1).max(500),
  name: z.string().trim().min(1).max(200),
  type: z.string().max(120),
  size: z.number().int().positive().max(RFI_MAX_FILE_BYTES),
})

/** Size and type are checked here, again by the database function, and by the storage bucket itself. */
function checkedFile(input: unknown): z.infer<typeof fileSchema> | null {
  const parsed = fileSchema.safeParse(input)
  if (!parsed.success) return null
  const type = rfiFileType(parsed.data)
  return type ? { ...parsed.data, type } : null
}

export async function registerRfiAttachmentAction(projectId: string, rfiId: string, file: unknown): Promise<Result<{ id: string }>> {
  await requireStaff()
  const checked = checkedFile(file)
  if (!uuid.safeParse(rfiId).success) return { ok: false, error: 'Invalid upload.' }
  if (!checked) return { ok: false, error: 'This file is not supported. Use PDF, image, Word, Excel, or CSV files up to 25 MB.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rfi_attachment_add', {
    p_rfi: rfiId,
    p_path: checked.path,
    p_name: checked.name,
    p_type: checked.type,
    p_size: checked.size,
  })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, id: data as string }
}

/** Drafts only. The object is removed after its record, so a failed removal leaves nothing readable behind. */
export async function removeRfiAttachmentAction(projectId: string, rfiId: string, attachmentId: string): Promise<Result> {
  await requireStaff()
  if (!uuid.safeParse(attachmentId).success) return { ok: false, error: 'Invalid file.' }
  const supabase = await createClient()
  const { data: path, error } = await supabase.rpc('rfi_attachment_remove', { p_attachment: attachmentId })
  if (error) return fail(error)
  if (typeof path === 'string') await supabase.storage.from(RFIS_BUCKET).remove([path])
  refresh(projectId, rfiId)
  return { ok: true }
}

// ───────────────────────── Responder and participants ─────────────────────────

export async function answerRfiAction(
  projectId: string,
  rfiId: string,
  expectedVersion: number,
  body: string,
  files: unknown[],
  requestId: string,
): Promise<Result<Saved>> {
  const supabase = await signedIn()
  if (!supabase) return { ok: false, error: SIGN_IN }
  if (!uuid.safeParse(rfiId).success || !uuid.safeParse(requestId).success) return { ok: false, error: 'Invalid request.' }
  if (!body.trim()) return { ok: false, error: 'Write your answer before submitting.' }
  if (!Array.isArray(files) || files.length > RFI_MAX_FILES) return { ok: false, error: `Attach up to ${RFI_MAX_FILES} files.` }
  const checked = files.map(checkedFile)
  if (checked.some((f) => !f)) {
    return { ok: false, error: 'One of the attached files is not supported. Use PDF, image, Word, Excel, or CSV files up to 25 MB.' }
  }
  const { data, error } = await supabase.rpc('rfi_answer', {
    p_rfi: rfiId,
    p_expected_version: expectedVersion,
    p_body: body.slice(0, 10000),
    p_files: checked,
    p_request: requestId,
  })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true, ...saved(data) }
}

export async function commentRfiAction(projectId: string, rfiId: string, commentId: string, body: string): Promise<Result> {
  const supabase = await signedIn()
  if (!supabase) return { ok: false, error: SIGN_IN }
  if (!uuid.safeParse(rfiId).success || !uuid.safeParse(commentId).success) return { ok: false, error: 'Invalid request.' }
  if (!body.trim()) return { ok: false, error: 'Write a comment first.' }
  const { error } = await supabase.rpc('rfi_comment', { p_rfi: rfiId, p_comment: commentId, p_body: body.slice(0, 4000) })
  if (error) return fail(error)
  refresh(projectId, rfiId)
  return { ok: true }
}

/** Storage policies decide: a file opens only for someone who can see the question it belongs to. */
export async function getRfiAttachmentUrlAction(path: string): Promise<Result<{ url: string }>> {
  const supabase = await signedIn()
  if (!supabase) return { ok: false, error: SIGN_IN }
  if (typeof path !== 'string' || !path || path.length > 500) return { ok: false, error: 'Invalid file.' }
  const { data, error } = await supabase.storage.from(RFIS_BUCKET).createSignedUrl(path, 60)
  if (error || !data) return { ok: false, error: 'This file is not available.' }
  return { ok: true, url: data.signedUrl }
}

/**
 * The referenced document opens only when the database confirms the caller may already open that document.
 * Seeing the question is never enough on its own.
 */
export async function getRfiDocumentUrlAction(rfiId: string): Promise<Result<{ url: string }>> {
  const supabase = await signedIn()
  if (!supabase) return { ok: false, error: SIGN_IN }
  if (!uuid.safeParse(rfiId).success) return { ok: false, error: 'Invalid document.' }
  const { data: path, error } = await supabase.rpc('rfi_document_path', { p_rfi: rfiId })
  if (error || typeof path !== 'string' || !path) {
    return { ok: false, error: 'You do not have access to this document. Ask the builder to share it with you.' }
  }
  const { data } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60)
  if (!data) return { ok: false, error: 'This document could not be opened. Try again shortly.' }
  return { ok: true, url: data.signedUrl }
}
