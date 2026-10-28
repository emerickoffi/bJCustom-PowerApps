'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession, canManage } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { friendlyDbError } from '@/lib/action-state'
import {
  COMPANY_DOCUMENT_CATEGORY_KEYS,
  COMPANY_DOCUMENT_PATH_PATTERN,
  DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PATH_PATTERN,
  DOCUMENTS_BUCKET,
  DOCUMENT_TYPES,
  companyDocumentStoragePath,
  documentStoragePath,
  isCompanyDocumentCategory,
  isDocumentCategory,
  isDocumentContentType,
} from '@/lib/documents'

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }

const uuid = z.uuid()

async function requireDocumentsStaff() {
  const session = await getSession()
  if (!session || !session.organizationId || !session.role || session.role === 'client' || session.activationRequired) {
    return null
  }
  const features = await getOrgFeatures(session.organizationId)
  if (!features.documents) return null
  return session as typeof session & { organizationId: string }
}

function revalidateDocuments(projectId: string | null) {
  if (projectId) {
    revalidatePath(`/projects/${projectId}/documents`)
    revalidatePath(`/portal/projects/${projectId}/documents`)
  }
  revalidatePath('/documents')
}

const companyPrepareSchema = z.object({
  documentId: uuid.optional(),
  contentType: z.string(),
  size: z.number().int().positive().max(DOCUMENT_MAX_BYTES, 'Files must be 25 MB or smaller.'),
})

/** Company Library uploads: organization-scoped, no project, administrators and project managers only. */
export async function prepareCompanyDocumentUpload(input: z.input<typeof companyPrepareSchema>): Promise<Result<{ path: string }>> {
  const session = await requireDocumentsStaff()
  if (!session || !canManage(session.role)) return { ok: false, error: 'Only administrators and project managers can upload company documents.' }
  const parsed = companyPrepareSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid upload.' }
  const { documentId, contentType } = parsed.data
  if (!isDocumentContentType(contentType)) return { ok: false, error: 'Upload a PDF, PNG, JPEG, or WebP file.' }

  if (documentId) {
    const supabase = await createClient()
    const { data: doc } = await supabase.from('project_documents').select('id, scope, archived_at').eq('id', documentId).maybeSingle()
    if (!doc || doc.scope !== 'company') return { ok: false, error: 'Document not found.' }
    if (doc.archived_at) return { ok: false, error: 'Restore this document before uploading a new version.' }
  }

  return {
    ok: true,
    data: { path: companyDocumentStoragePath(session.organizationId, documentId ?? crypto.randomUUID(), crypto.randomUUID(), contentType) },
  }
}

const prepareSchema = z.object({
  projectId: uuid,
  documentId: uuid.optional(),
  contentType: z.string(),
  size: z.number().int().positive().max(DOCUMENT_MAX_BYTES, 'Files must be 25 MB or smaller.'),
})

/** Returns a server-generated, collision-resistant storage path. Organization and IDs never come from the browser. */
export async function prepareDocumentUpload(input: z.input<typeof prepareSchema>): Promise<Result<{ path: string }>> {
  const session = await requireDocumentsStaff()
  if (!session) return { ok: false, error: 'You do not have permission to upload documents.' }
  const parsed = prepareSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid upload.' }
  const { projectId, documentId, contentType } = parsed.data
  if (!isDocumentContentType(contentType)) return { ok: false, error: 'Upload a PDF, PNG, JPEG, or WebP file.' }

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, organization_id, archived_at')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.organization_id !== session.organizationId) return { ok: false, error: 'Project not found.' }
  if (project.archived_at) return { ok: false, error: 'This project is archived.' }
  const { data: allowed } = await supabase.rpc('can_view_project_internal', { p_project: projectId })
  if (!allowed) return { ok: false, error: 'You do not have permission to upload documents to this project.' }

  if (documentId) {
    const { data: doc } = await supabase.from('project_documents').select('id, project_id, scope, archived_at').eq('id', documentId).maybeSingle()
    if (!doc || doc.scope !== 'project' || doc.project_id !== projectId) return { ok: false, error: 'Document not found.' }
    if (doc.archived_at) return { ok: false, error: 'Restore this document before uploading a new version.' }
  }

  return {
    ok: true,
    data: { path: documentStoragePath(session.organizationId, projectId, documentId ?? crypto.randomUUID(), crypto.randomUUID(), contentType) },
  }
}

const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  pdf: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
}

/** Reads only the first bytes of the stored object to confirm it really is the declared type. */
async function storedBytesMatch(path: string, ext: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient().storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 30)
    if (!data?.signedUrl) return false
    const res = await fetch(data.signedUrl, { headers: { Range: 'bytes=0-15' }, cache: 'no-store' })
    if (!res.ok) return false
    const bytes = new Uint8Array(await res.arrayBuffer())
    return SIGNATURES[ext]?.(bytes) ?? false
  } catch {
    return false
  }
}

const ALL_CATEGORY_KEYS = [...new Set([...DOCUMENT_CATEGORY_KEYS, ...COMPANY_DOCUMENT_CATEGORY_KEYS])] as [string, ...string[]]

function isUploadPath(path: string) {
  return DOCUMENT_PATH_PATTERN.test(path) || COMPANY_DOCUMENT_PATH_PATTERN.test(path)
}

const registerSchema = z.object({
  path: z.string().refine(isUploadPath, 'Invalid upload reference.'),
  originalFilename: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1, 'Enter a document name').max(200).optional(),
  category: z.enum(ALL_CATEGORY_KEYS).optional(),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(['internal', 'homeowner']).default('internal'),
  revisionNotes: z.string().trim().max(1000).optional(),
})

/** Confirms the uploaded object and records it as a new document or the next version of an existing one. Safe to retry. */
export async function registerDocumentVersion(
  input: z.input<typeof registerSchema>,
): Promise<Result<{ documentId: string; versionNumber: number }>> {
  const session = await requireDocumentsStaff()
  if (!session) return { ok: false, error: 'You do not have permission to upload documents.' }
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid upload.' }
  const v = parsed.data
  const companyMatch = COMPANY_DOCUMENT_PATH_PATTERN.exec(v.path)
  const projectMatch = companyMatch ? null : DOCUMENT_PATH_PATTERN.exec(v.path)
  const orgId = companyMatch ? companyMatch[1] : projectMatch![1]
  const projectId = companyMatch ? null : projectMatch![2]
  const ext = companyMatch ? companyMatch[4] : projectMatch![5]
  if (orgId !== session.organizationId) return { ok: false, error: 'You do not have permission to upload documents.' }
  if (companyMatch) {
    if (!canManage(session.role)) return { ok: false, error: 'Only administrators and project managers can upload company documents.' }
    if (v.category && !isCompanyDocumentCategory(v.category)) return { ok: false, error: 'Choose a Company Library category.' }
  } else {
    if (v.category && !isDocumentCategory(v.category)) return { ok: false, error: 'Choose a project document category.' }
    if (v.visibility === 'homeowner' && !canManage(session.role)) {
      return { ok: false, error: 'Only administrators and project managers can share documents with homeowners.' }
    }
  }

  const supabase = await createClient()
  if (!(await storedBytesMatch(v.path, ext))) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([v.path])
    return { ok: false, error: `The file contents do not match a ${Object.values(DOCUMENT_TYPES).find((t) => t.ext === ext)?.label ?? 'supported'} file.` }
  }

  const { data, error } = companyMatch
    ? await supabase.rpc('register_company_document_version', {
        p_storage_path: v.path,
        p_original_filename: v.originalFilename,
        p_name: v.name ?? null,
        p_category: v.category ?? null,
        p_description: v.description ?? null,
        p_revision_notes: v.revisionNotes ?? null,
      })
    : await supabase.rpc('register_project_document_version', {
        p_storage_path: v.path,
        p_original_filename: v.originalFilename,
        p_name: v.name ?? null,
        p_category: v.category ?? null,
        p_description: v.description ?? null,
        p_visibility: v.visibility,
        p_revision_notes: v.revisionNotes ?? null,
      })
  if (error) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([v.path])
    return { ok: false, error: friendlyDbError(error) }
  }
  revalidateDocuments(projectId)
  const result = data as { document_id: string; version_number: number }
  return { ok: true, data: { documentId: result.document_id, versionNumber: result.version_number } }
}

/** Removes an uploaded object that was never registered. The storage policy only allows unreferenced objects the caller owns. */
export async function discardDocumentUpload(path: string): Promise<void> {
  if (!isUploadPath(path)) return
  const supabase = await createClient()
  await supabase.storage.from(DOCUMENTS_BUCKET).remove([path])
}

const detailsSchema = z.object({
  documentId: uuid,
  name: z.string().trim().min(1, 'Enter a document name').max(200),
  category: z.enum(ALL_CATEGORY_KEYS),
  description: z.string().trim().max(2000).optional(),
})

export async function updateDocumentDetails(input: z.input<typeof detailsSchema>): Promise<Result> {
  const session = await requireDocumentsStaff()
  if (!session) return { ok: false, error: 'You do not have permission to edit documents.' }
  const parsed = detailsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the document details.' }
  const supabase = await createClient()
  const { data: doc } = await supabase.from('project_documents').select('project_id, scope').eq('id', parsed.data.documentId).maybeSingle()
  if (!doc) return { ok: false, error: 'Document not found.' }
  const categoryFits = doc.scope === 'company' ? isCompanyDocumentCategory(parsed.data.category) : isDocumentCategory(parsed.data.category)
  if (!categoryFits) return { ok: false, error: 'Choose a category from this library.' }
  const { error } = await supabase.rpc('update_project_document_details', {
    p_document: parsed.data.documentId,
    p_name: parsed.data.name,
    p_category: parsed.data.category,
    p_description: parsed.data.description ?? null,
  })
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidateDocuments(doc.project_id)
  return { ok: true, data: undefined }
}

export async function setDocumentVisibility(documentId: string, visibility: 'internal' | 'homeowner'): Promise<Result> {
  const session = await requireDocumentsStaff()
  if (!session || !canManage(session.role)) return { ok: false, error: 'Only administrators and project managers can change document sharing.' }
  if (!uuid.safeParse(documentId).success || !['internal', 'homeowner'].includes(visibility)) return { ok: false, error: 'Document not found.' }
  const supabase = await createClient()
  const { data: doc } = await supabase.from('project_documents').select('project_id').eq('id', documentId).maybeSingle()
  if (!doc) return { ok: false, error: 'Document not found.' }
  const { error } = await supabase.rpc('set_project_document_visibility', { p_document: documentId, p_visibility: visibility })
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidateDocuments(doc.project_id)
  return { ok: true, data: undefined }
}

export async function setDocumentArchived(documentId: string, archived: boolean): Promise<Result> {
  const session = await requireDocumentsStaff()
  if (!session || !canManage(session.role)) return { ok: false, error: 'Only administrators and project managers can archive documents.' }
  if (!uuid.safeParse(documentId).success) return { ok: false, error: 'Document not found.' }
  const supabase = await createClient()
  const { data: doc } = await supabase.from('project_documents').select('project_id').eq('id', documentId).maybeSingle()
  if (!doc) return { ok: false, error: 'Document not found.' }
  const { error } = await supabase.rpc('set_project_document_archived', { p_document: documentId, p_archived: archived })
  if (error) return { ok: false, error: friendlyDbError(error) }
  revalidateDocuments(doc.project_id)
  return { ok: true, data: undefined }
}

export type DocumentVersionEntry = {
  id: string
  versionNumber: number
  originalFilename: string
  contentType: string
  sizeBytes: number
  revisionNotes: string | null
  uploadedBy: string
  uploadedAt: string
}

export async function getDocumentHistory(documentId: string): Promise<Result<DocumentVersionEntry[]>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Sign in required.' }
  if (!uuid.safeParse(documentId).success) return { ok: false, error: 'Document not found.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('project_document_versions')
    .select('id, version_number, original_filename, content_type, size_bytes, revision_notes, uploaded_by, uploaded_at')
    .eq('document_id', documentId)
    .order('version_number', { ascending: false })
  if (error) return { ok: false, error: 'Version history could not be loaded.' }
  if (!data?.length) return { ok: false, error: 'This document is no longer available.' }
  const ids = [...new Set(data.map((v) => v.uploaded_by as string))]
  const { data: people } = await supabase.from('profiles').select('id, full_name, email').in('id', ids)
  const names = new Map((people ?? []).map((p) => [p.id as string, (p.full_name || p.email || 'Team member') as string]))
  return {
    ok: true,
    data: data.map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      originalFilename: v.original_filename,
      contentType: v.content_type,
      sizeBytes: v.size_bytes,
      revisionNotes: v.revision_notes,
      uploadedBy: names.get(v.uploaded_by) ?? 'Team member',
      uploadedAt: v.uploaded_at,
    })),
  }
}

/**
 * Short-lived signed URL for one version. Uses the caller's own session, so both the
 * version row (RLS) and the storage object (storage policy) must authorize the request.
 */
export async function getDocumentFileUrl(
  versionId: string,
  mode: 'preview' | 'download',
): Promise<Result<{ url: string; expiresAt: number }>> {
  const session = await getSession()
  if (!session) return { ok: false, error: 'Sign in required.' }
  if (!uuid.safeParse(versionId).success) return { ok: false, error: 'This document is no longer available.' }
  const supabase = await createClient()
  const { data: version } = await supabase
    .from('project_document_versions')
    .select('storage_path, original_filename, version_number')
    .eq('id', versionId)
    .maybeSingle()
  if (!version) return { ok: false, error: 'This document is no longer available, or you no longer have access to it.' }
  const seconds = mode === 'preview' ? 300 : 60
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(version.storage_path, seconds, mode === 'download' ? { download: version.original_filename } : undefined)
  if (error || !data?.signedUrl) return { ok: false, error: 'The file could not be retrieved. Please try again.' }
  return { ok: true, data: { url: data.signedUrl, expiresAt: Date.now() + seconds * 1000 } }
}
