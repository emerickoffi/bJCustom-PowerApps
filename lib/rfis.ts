export const RFIS_BUCKET = 'project-rfis'
export const RFI_MAX_FILE_BYTES = 25 * 1024 * 1024
export const RFI_MAX_FILES = 10
export const RFI_PAGE_SIZE = 25
/** URL parameter that holds the open question, so notification links and refreshes land on the same record. */
export const RFI_PARAM = 'rfi'

export const RFI_STATUSES = ['draft', 'open', 'answered', 'closed'] as const
export type RfiStatus = (typeof RFI_STATUSES)[number]

export const RFI_STATUS_LABELS: Record<RfiStatus, string> = {
  draft: 'Draft',
  open: 'Open',
  answered: 'Answered',
  closed: 'Closed',
}

export const RFI_STATUS_HINTS: Record<RfiStatus, string> = {
  draft: 'Not sent yet. Only its author and project managers can see it.',
  open: 'Sent and waiting for the assigned responder.',
  answered: 'An official answer was submitted and is waiting for review.',
  closed: 'Reviewed and resolved.',
}

export function isRfiStatus(value: unknown): value is RfiStatus {
  return typeof value === 'string' && (RFI_STATUSES as readonly string[]).includes(value)
}

export type RfiScope = 'all' | 'mine'

export type RfiListRow = {
  id: string
  rfi_number: number | null
  status: RfiStatus
  subject: string
  responder_user_id: string | null
  responder_name: string | null
  responder_company: string | null
  due_date: string | null
  homeowner_shared: boolean
  updated_at: string
}

export type RfiRecord = RfiListRow & {
  organization_id: string
  project_id: string
  question: string
  location: string | null
  document_version_id: string | null
  document_label: string | null
  created_by: string | null
  created_by_name: string
  sent_at: string | null
  answered_at: string | null
  closed_at: string | null
  cycle: number
  row_version: number
  created_at: string
}

export const RFI_LIST_COLUMNS =
  'id, rfi_number, status, subject, responder_user_id, responder_name, responder_company, due_date, homeowner_shared, updated_at'
export const RFI_COLUMNS = `${RFI_LIST_COLUMNS}, organization_id, project_id, question, location, document_version_id, document_label, created_by, created_by_name, sent_at, answered_at, closed_at, cycle, row_version, created_at`

export type RfiResponse = {
  id: string
  cycle: number
  body: string
  responded_by: string | null
  responded_by_name: string
  responded_by_company: string | null
  created_at: string
}

export type RfiComment = { id: string; body: string; author_id: string | null; author_name: string; created_at: string }

export type RfiEvent = {
  id: string
  event_type: string
  internal: boolean
  actor_name: string
  from_status: string | null
  to_status: string | null
  note: string | null
  details: Record<string, unknown>
  created_at: string
}

export type RfiAttachment = {
  id: string
  kind: 'question' | 'answer'
  response_id: string | null
  storage_path: string
  file_name: string
  content_type: string | null
  size_bytes: number
  created_at: string
}

export type RfiPermissions = {
  /** Works the question: requester, managers, project staff, or the current responder. Never a homeowner. */
  participant: boolean
  /** Requester rights: its author while still on the project, and authorized managers. */
  canEdit: boolean
  /** Administrators and project managers with access to the project. */
  canManage: boolean
  /** The signed-in user is the assigned responder. */
  isResponder: boolean
}

export type RfiDetail = {
  rfi: RfiRecord
  responses: RfiResponse[]
  comments: RfiComment[]
  events: RfiEvent[]
  attachments: RfiAttachment[]
  permissions: RfiPermissions
  viewerId: string
  projectName: string | null
  today: string
}

export type RfiResponderOption = {
  option_key: string
  user_id: string | null
  full_name: string
  email: string | null
  kind: 'team' | 'subcontractor' | 'directory'
  company_id: string | null
  company_name: string | null
  person_id: string | null
  eligible: boolean
  reason: RfiIneligibleReason | null
}

export type RfiDocumentOption = { versionId: string; label: string }

export type RfiFormOptions = {
  project: { id: string; name: string; organization_id: string }
  responders: RfiResponderOption[]
  documents: RfiDocumentOption[]
  /** Administrators and project managers can open the access-management pages the explanations link to. */
  manager: boolean
}

export type RfiProjectOption = { id: string; name: string; project_number: string | null }

export type RfiDraftInput = {
  subject: string
  question: string
  responder_user_id: string
  due_date: string
  location: string
  document_version_id: string
}

export type RfiFileInput = { path: string; name: string; type: string; size: number }

/** RFI-003 for a sent question; drafts have no number until they are sent. */
export function rfiRef(rfiNumber: number | null | undefined): string {
  return rfiNumber ? `RFI-${String(rfiNumber).padStart(3, '0')}` : 'Draft'
}

export function rfisPath(projectId: string, rfiId?: string | null): string {
  const base = `/projects/${encodeURIComponent(projectId)}/rfis`
  return rfiId ? `${base}?${RFI_PARAM}=${encodeURIComponent(rfiId)}` : base
}

/** "RFI-003", "rfi 3", "#3" and "3" all search by number. */
export function parseRfiNumber(query: string): number | null {
  const match = query.trim().match(/^(?:rfi)?[\s#-]*0*(\d{1,6})$/i)
  if (!match) return null
  const n = Number(match[1])
  return n > 0 ? n : null
}

/** Only an open question can be overdue: once answered or closed the responder owes nothing. */
export function isRfiOverdue(status: string, dueDate: string | null, today: string): boolean {
  return status === 'open' && !!dueDate && dueDate < today
}

export function responderLabel(row: Pick<RfiListRow, 'responder_name' | 'responder_company'>): string {
  if (!row.responder_name) return 'Not assigned'
  return row.responder_company ? `${row.responder_name} · ${row.responder_company}` : row.responder_name
}

export type RfiIneligibleReason = 'not_activated' | 'not_on_project' | 'company_inactive' | 'no_portal_account' | 'directory_only'

/**
 * Why a person cannot be the responder yet, and where an administrator or project manager fixes it.
 * Nothing here provisions access or sends an invitation; the links open the existing access pages.
 */
export function ineligibleExplanation(
  option: Pick<RfiResponderOption, 'reason' | 'full_name' | 'company_id' | 'company_name' | 'person_id'>,
  projectId: string,
): { message: string; href: string; linkLabel: string } {
  const project = `/projects/${encodeURIComponent(projectId)}`
  switch (option.reason) {
    case 'not_activated':
      return {
        message: `${option.full_name} has not activated their account yet, so they cannot sign in to answer.`,
        href: '/team',
        linkLabel: 'Open Team to check their invitation',
      }
    case 'not_on_project':
      return {
        message: `${option.full_name} is on your team but is not assigned to this project, so they cannot open its questions.`,
        href: `${project}#project-team`,
        linkLabel: 'Open the project team',
      }
    case 'company_inactive':
      return {
        message: `${option.company_name ?? 'This company'} is inactive, so its people cannot sign in to this project.`,
        href: option.company_id ? `/subcontractors/${encodeURIComponent(option.company_id)}` : '/subcontractors',
        linkLabel: 'Open the company record',
      }
    case 'no_portal_account':
      return {
        message: `${option.company_name ?? option.full_name} works on this project, but nobody there has a subcontractor workspace sign-in yet.`,
        href: option.company_id ? `/subcontractors/${encodeURIComponent(option.company_id)}` : '/subcontractors',
        linkLabel: 'Set up workspace access for this company',
      }
    default:
      return {
        message: `${option.full_name} is listed in the project directory only. A directory entry does not include a sign-in, so they could not open or answer the question.`,
        href: option.person_id ? `/contacts/people/${encodeURIComponent(option.person_id)}` : `${project}/contacts`,
        linkLabel: 'Open their directory record',
      }
  }
}

const FILE_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  doc: 'application/msword',
  csv: 'text/csv',
}
const ALLOWED_TYPES = new Set(Object.values(FILE_TYPES))

export const RFI_FILE_ACCEPT = Object.keys(FILE_TYPES)
  .map((ext) => `.${ext}`)
  .join(',')
export const RFI_FILE_HELP = 'PDF, image, Word, Excel, or CSV. Up to 25 MB each, 10 files.'

/**
 * The content type to store, or null when the file is not accepted. Browsers report no type for some
 * files (HEIC) and a spreadsheet type for CSV, so the extension decides when the reported type is not allowed.
 */
export function rfiFileType(file: { name: string; type: string }): string | null {
  if (ALLOWED_TYPES.has(file.type)) return file.type
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return (ext && FILE_TYPES[ext]) || null
}

export function rfiFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (file.size <= 0) return `${file.name} is empty.`
  if (file.size > RFI_MAX_FILE_BYTES) return `${file.name} is larger than 25 MB.`
  if (!rfiFileType(file)) return `${file.name} is not a supported file type. Use PDF, image, Word, Excel, or CSV files.`
  return null
}

/** {organization}/{project}/{question}/{question|answer}/{uuid}-{file name}: the layout the storage policies check. */
export function rfiObjectPath(
  rfi: { organization_id: string; project_id: string; id: string },
  kind: 'question' | 'answer',
  fileName: string,
  uuid: string,
): string {
  const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file'
  return `${rfi.organization_id}/${rfi.project_id}/${rfi.id}/${kind}/${uuid}-${safe}`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** One plain sentence per history entry. */
export function rfiEventSummary(event: Pick<RfiEvent, 'event_type' | 'details'>): string {
  const d = event.details ?? {}
  switch (event.event_type) {
    case 'created':
      return 'Draft created'
    case 'sent':
      return text(d.responder_name) ? `Question sent to ${text(d.responder_name)}` : 'Question sent'
    case 'amended':
      return 'Question amended'
    case 'reassigned':
      return text(d.from_name) && text(d.to_name)
        ? `Reassigned from ${text(d.from_name)} to ${text(d.to_name)}`
        : `Reassigned to ${text(d.to_name) ?? 'a new responder'}`
    case 'answered':
      return 'Official answer submitted'
    case 'closed':
      return 'Question closed'
    case 'reopened':
      return 'Clarification requested'
    case 'shared':
      return 'Shared with the homeowner (read-only)'
    case 'unshared':
      return 'Homeowner sharing removed'
    case 'attachment_added':
      return text(d.file_name) ? `File added to the question: ${text(d.file_name)}` : 'File added to the question'
    default:
      return event.event_type.replace(/_/g, ' ')
  }
}

export const RFIS_SETUP_MESSAGE =
  'Questions (RFIs) are not set up in this environment yet. The database migration has to be applied first.'

export function isRfiSetupError(error: { code?: string } | null | undefined): boolean {
  return ['PGRST205', 'PGRST202', '42P01', '42883'].includes(error?.code ?? '')
}

/** The workflow functions raise this when the record changed after the caller loaded it. */
export function isRfiConflict(error: { code?: string } | null | undefined): boolean {
  return error?.code === '40001'
}

const GENERIC_ERROR = 'Something went wrong. Please try again.'

/** The workflow functions write their messages for end users; anything else gets a generic message. */
export function rfiDbError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return GENERIC_ERROR
  if (isRfiSetupError(error)) return RFIS_SETUP_MESSAGE
  const message = error.message ?? ''
  if (['P0001', '40001'].includes(error.code ?? '') && message) return message
  if (error.code === '42501') {
    return message && !/^permission denied|row-level security/i.test(message)
      ? message
      : 'You do not have permission to do that.'
  }
  if (error.code === '23514') return 'Some text is longer than allowed. Shorten it and try again.'
  if (['22007', '22008', '22P02'].includes(error.code ?? '')) return 'Check the due date and try again.'
  return GENERIC_ERROR
}
