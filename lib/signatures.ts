export type SignatureStatus =
  | 'draft'
  | 'awaiting_signatures'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'cancelled'
  | 'expired'
  | 'failed'

export type SignerStatus = 'awaiting' | 'on_hold' | 'signed' | 'declined' | 'error'
export type SigningMethod = 'email' | 'embedded'
export type SignatureSetupState = 'disabled' | 'setup_required' | 'enabled'

export const TERMINAL_STATUSES: SignatureStatus[] = ['completed', 'declined', 'cancelled', 'expired', 'failed']
export const OPEN_STATUSES: SignatureStatus[] = ['draft', 'awaiting_signatures', 'partially_signed']

export const SIGNATURE_STATUS_LABELS: Record<SignatureStatus, string> = {
  draft: 'Preparing',
  awaiting_signatures: 'Awaiting signatures',
  partially_signed: 'Partially signed',
  completed: 'Signed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
  failed: 'Failed',
}

export const SIGNER_STATUS_LABELS: Record<SignerStatus, string> = {
  awaiting: 'Waiting to sign',
  on_hold: 'Waiting for earlier signers',
  signed: 'Signed',
  declined: 'Declined',
  error: 'Delivery problem',
}

export type SignatureSummary = {
  requestId: string
  status: SignatureStatus
  signed: number
  total: number
  versionNumber: number | null
  hasSignedPdf: boolean
}

export type SignerView = {
  id: string
  name: string
  email: string
  kind: 'homeowner' | 'staff'
  order: number
  status: SignerStatus
  signedAt: string | null
  lastViewedAt: string | null
  declineReason: string | null
  initials: boolean
}

export type SignatureRequestView = {
  id: string
  title: string
  status: SignatureStatus
  method: SigningMethod
  ordered: boolean
  testMode: boolean
  sourceVersionNumber: number | null
  createdAt: string
  completedAt: string | null
  requestedBy: string
  errorMessage: string | null
  artifactError: string | null
  hasSignedPdf: boolean
  signedSizeBytes: number | null
  signers: SignerView[]
  events: { id: string; type: string; time: string; source: string }[]
}

export type EligibleSigner = {
  key: string
  kind: 'homeowner' | 'staff'
  id: string
  name: string
  email: string | null
  detail: string
  eligible: boolean
  reason?: string
}

export const EVENT_LABELS: Record<string, string> = {
  request_sent: 'Request sent',
  signature_request_sent: 'Request delivered by Dropbox Sign',
  signature_request_viewed: 'Viewed by a signer',
  signature_request_signed: 'Signed by a signer',
  signature_request_all_signed: 'All signers signed',
  signature_request_downloadable: 'Signed PDF ready',
  signature_request_declined: 'Declined by a signer',
  signature_request_canceled: 'Request cancelled',
  signature_request_expired: 'Request expired',
  signature_request_invalid: 'Request rejected by provider',
  signature_request_email_bounce: 'Signer email bounced',
  signature_request_remind: 'Reminder sent',
  file_error: 'Provider file error',
  cancelled_by_staff: 'Cancelled by staff',
  status_refreshed: 'Status refreshed from Dropbox Sign',
}

export function eventLabel(type: string) {
  return EVENT_LABELS[type] ?? type.replace(/_/g, ' ')
}
