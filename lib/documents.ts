/** Central definitions for the project document library. Mirrors the CHECK constraints on public.project_documents. */

export const DOCUMENTS_BUCKET = 'project-documents'
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024
export const DOCUMENTS_PAGE_SIZE = 25

export const DOCUMENT_CATEGORIES = [
  { key: 'floor_plans', label: 'Floor Plans & Architectural Drawings' },
  { key: 'engineering', label: 'Engineering & Structural Reports' },
  { key: 'permits', label: 'Permits & Inspections' },
  { key: 'contracts', label: 'Contracts & Agreements' },
  { key: 'estimates', label: 'Estimates & Budgets' },
  { key: 'change_orders', label: 'Change Orders' },
  { key: 'construction_reports', label: 'Construction Reports' },
  { key: 'photos', label: 'Photos & Site Documentation' },
  { key: 'warranty', label: 'Warranty Documents' },
  { key: 'other', label: 'Other' },
] as const

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]['key']
export type DocumentVisibility = 'internal' | 'homeowner'

export const DOCUMENT_CATEGORY_KEYS = DOCUMENT_CATEGORIES.map((c) => c.key) as [DocumentCategory, ...DocumentCategory[]]

export function categoryLabel(key: string): string {
  return DOCUMENT_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other'
}

export function isDocumentCategory(value: string | undefined | null): value is DocumentCategory {
  return DOCUMENT_CATEGORIES.some((c) => c.key === value)
}

/** Allowed upload types. The extension is part of the storage key and the database checks it against the stored content type. */
export const DOCUMENT_TYPES = {
  'application/pdf': { ext: 'pdf', label: 'PDF' },
  'image/png': { ext: 'png', label: 'PNG' },
  'image/jpeg': { ext: 'jpg', label: 'JPEG' },
  'image/webp': { ext: 'webp', label: 'WebP' },
} as const

export type DocumentContentType = keyof typeof DOCUMENT_TYPES

export const DOCUMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp'
export const DOCUMENT_TYPES_HINT = 'PDF, PNG, JPEG, or WebP, up to 25 MB'

export function isDocumentContentType(value: string): value is DocumentContentType {
  return value in DOCUMENT_TYPES
}

export function fileTypeLabel(contentType: string | null | undefined): string {
  return contentType && isDocumentContentType(contentType) ? DOCUMENT_TYPES[contentType].label : 'File'
}

export function canPreview(contentType: string | null | undefined): boolean {
  return Boolean(contentType && isDocumentContentType(contentType))
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function validateDocumentFile(file: { name: string; size: number; type: string }): string | null {
  if (!isDocumentContentType(file.type)) return `${file.name} is not a supported file type. Upload a PDF, PNG, JPEG, or WebP file.`
  if (file.size <= 0) return `${file.name} is empty.`
  if (file.size > DOCUMENT_MAX_BYTES) return `${file.name} is larger than 25 MB.`
  return null
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
export const DOCUMENT_PATH_PATTERN = new RegExp(`^library/(${UUID})/(${UUID})/(${UUID})/(${UUID})\\.(pdf|png|jpg|webp)$`)

export function documentStoragePath(orgId: string, projectId: string, documentId: string, versionId: string, contentType: DocumentContentType) {
  return `library/${orgId}/${projectId}/${documentId}/${versionId}.${DOCUMENT_TYPES[contentType].ext}`
}

export type DocumentRow = {
  id: string
  project_id: string
  name: string
  description: string | null
  category: DocumentCategory
  visibility: DocumentVisibility
  current_version_number: number
  updated_at: string
  archived_at: string | null
  current_version: {
    id: string
    original_filename: string
    content_type: string
    size_bytes: number
    uploaded_by: string
    uploaded_at: string
  } | null
  project?: { id: string; name: string; project_number: string | null } | null
}

export type DocumentVersionRow = {
  id: string
  version_number: number
  original_filename: string
  content_type: string
  size_bytes: number
  revision_notes: string | null
  uploaded_by: string
  uploaded_at: string
}
