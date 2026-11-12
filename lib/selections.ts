import type { SemanticTone } from '@/components/shared/semantic-badge'

export const SELECTIONS_BUCKET = 'selections'
export const SELECTION_FILE_MAX_BYTES = 15 * 1024 * 1024
export const SELECTION_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const SELECTION_SPEC_TYPES = ['application/pdf', ...SELECTION_PHOTO_TYPES] as const

export const SELECTION_STATUSES = [
  'draft',
  'awaiting_homeowner',
  'awaiting_builder_review',
  'change_order_required',
  'approved',
  'rejected',
  'canceled',
] as const
export type SelectionStatus = (typeof SELECTION_STATUSES)[number]

export const SELECTION_ACTIONS = [
  'send',
  'recall',
  'approve',
  'require_change_order',
  'request_clarification',
  'return_revision',
  'reopen',
  'reject',
  'cancel',
] as const
export type SelectionAction = (typeof SELECTION_ACTIONS)[number]

/** Actions that require a note; mirrors the checks in public.selection_transition. */
export const NOTE_REQUIRED_ACTIONS: ReadonlySet<SelectionAction> = new Set(['request_clarification', 'return_revision', 'reopen', 'reject'])

export const STATUS_LABELS: Record<SelectionStatus, string> = {
  draft: 'Draft',
  awaiting_homeowner: 'Waiting on homeowner',
  awaiting_builder_review: 'Builder review',
  change_order_required: 'Change order required',
  approved: 'Approved',
  rejected: 'Rejected',
  canceled: 'Canceled',
}

/** Homeowner-facing wording for the same states. */
export const PORTAL_STATUS_LABELS: Record<SelectionStatus, string> = {
  draft: 'Draft',
  awaiting_homeowner: 'Your choice needed',
  awaiting_builder_review: 'With your builder',
  change_order_required: 'Change order pending',
  approved: 'Confirmed',
  rejected: 'Not accepted',
  canceled: 'Canceled',
}

export const STATUS_TONES: Record<SelectionStatus, SemanticTone> = {
  draft: 'neutral',
  awaiting_homeowner: 'pending',
  awaiting_builder_review: 'info',
  change_order_required: 'orange',
  approved: 'success',
  rejected: 'danger',
  canceled: 'neutral',
}

export const ACTION_LABELS: Record<SelectionAction, string> = {
  send: 'Send to homeowner',
  recall: 'Recall to draft',
  approve: 'Approve selection',
  require_change_order: 'Require change order',
  request_clarification: 'Request clarification',
  return_revision: 'Return for revision',
  reopen: 'Reopen selection',
  reject: 'Reject choice',
  cancel: 'Cancel selection',
}

export const EVENT_LABELS: Record<string, string> = {
  created: 'Created',
  sent: 'Sent to homeowner',
  recalled: 'Recalled to draft',
  homeowner_selected: 'Homeowner made a choice',
  approved: 'Approved',
  change_order_required: 'Change order required',
  change_order_created: 'Change order created',
  change_order_approved: 'Change order approved',
  change_order_rejected: 'Change order rejected',
  change_order_void: 'Change order voided',
  clarification_requested: 'Clarification requested',
  revision_requested: 'Returned for revision',
  reopened: 'Reopened',
  rejected: 'Rejected',
  canceled: 'Canceled',
}

export function isSelectionStatus(value: string): value is SelectionStatus {
  return (SELECTION_STATUSES as readonly string[]).includes(value)
}

export function selectionsPath(projectId: string) {
  return `/projects/${projectId}/selections`
}

export function selectionPath(projectId: string, selectionId: string) {
  return `/projects/${projectId}/selections/${selectionId}`
}

export function portalSelectionPath(selectionId: string) {
  return `/portal/selections/${selectionId}`
}

/** Which staff actions are offered for a status. The database enforces the same rules. */
export function availableActions(status: SelectionStatus, opts: { changeOrderApproved: boolean; needsChangeOrder: boolean }): SelectionAction[] {
  switch (status) {
    case 'draft':
      return ['send', 'cancel']
    case 'awaiting_homeowner':
      return ['recall', 'cancel']
    case 'awaiting_builder_review':
      return [opts.needsChangeOrder ? 'require_change_order' : 'approve', 'request_clarification', 'return_revision', 'reject', 'cancel']
    case 'change_order_required':
      return [...(opts.changeOrderApproved ? (['approve'] as const) : []), 'request_clarification', 'return_revision', 'reject', 'cancel']
    case 'approved':
      return ['reopen']
    default:
      return []
  }
}

/** Difference between the chosen price and the allowance. Positive means the homeowner owes more. */
export function allowanceDelta(allowanceCents: number | null, selectedCents: number | null): number | null {
  if (allowanceCents === null || selectedCents === null) return null
  return selectedCents - allowanceCents
}

export function isOverdue(dueDate: string | null, status: SelectionStatus, today = new Date()): boolean {
  if (!dueDate || status !== 'awaiting_homeowner') return false
  const iso = today.toISOString().slice(0, 10)
  return dueDate < iso
}

export type SelectionListRow = {
  id: string
  name: string
  category: string
  location: string | null
  status: SelectionStatus
  allowance_cents: number | null
  selected_price_cents: number | null
  selected_option_id?: string | null
  due_date: string | null
  updated_at: string
}

export type SelectionOption = {
  id: string
  name: string
  description: string | null
  supplier: string | null
  model_number: string | null
  price_cents: number
  internal_cost_cents: number | null
  availability: string | null
  photo_path: string | null
  spec_path: string | null
  spec_name: string | null
  sort_order: number
  photo_url?: string | null
  spec_url?: string | null
}

export type SelectionEvent = {
  id: string
  event: string
  from_status: string | null
  to_status: string | null
  actor_name: string | null
  actor_kind: 'staff' | 'homeowner' | 'system'
  note: string | null
  internal?: boolean
  created_at: string
}

export type PortalSelectionListItem = {
  id: string
  project_id: string
  project_name: string
  name: string
  category: string
  location: string | null
  due_date: string | null
  status: SelectionStatus
  allowance_cents: number | null
  selected_option_name: string | null
  selected_price_cents: number | null
  updated_at: string
}

export type PortalSelectionDetail = {
  id: string
  project_id: string
  project_name: string
  name: string
  category: string
  description: string | null
  location: string | null
  notes: string | null
  allowance_cents: number | null
  due_date: string | null
  status: SelectionStatus
  revision: number
  version: number
  selected_option_id: string | null
  selected_price_cents: number | null
  selected_at: string | null
  selected_by_name: string | null
  homeowner_comment: string | null
  can_decide: boolean
  options: (Omit<SelectionOption, 'internal_cost_cents' | 'sort_order'> & { photo_url?: string | null; spec_url?: string | null })[]
  history: SelectionEvent[]
}
