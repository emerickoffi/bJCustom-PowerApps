import type { SemanticTone } from '@/components/shared/semantic-badge'
import type { ClientPricingCategory, ClientPricingLine, PricingDisplay, ProposalText } from '@/lib/proposals'

export const APPROVAL_DOCUMENT_TYPES = ['estimate', 'change_order'] as const
export type ApprovalDocumentType = (typeof APPROVAL_DOCUMENT_TYPES)[number]

export const APPROVAL_DECISIONS = ['approved', 'changes_requested', 'rejected'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'superseded' | 'in_revision'

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Waiting for you',
  approved: 'Approved',
  rejected: 'Declined',
  changes_requested: 'Changes requested',
  superseded: 'Replaced by a newer version',
  in_revision: 'Being revised',
}

export const APPROVAL_STATUS_TONES: Record<ApprovalStatus, SemanticTone> = {
  pending: 'pending',
  approved: 'success',
  rejected: 'danger',
  changes_requested: 'orange',
  superseded: 'neutral',
  in_revision: 'info',
}

export const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
  approved: 'Approved',
  changes_requested: 'Requested changes',
  rejected: 'Declined',
}

export const DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, string> = {
  estimate: 'Estimate',
  change_order: 'Change order',
}

export type ApprovalListItem = {
  document_type: ApprovalDocumentType
  id: string
  project_id: string
  project_name: string
  number: string
  title: string
  revision: number
  amount_cents: number
  schedule_impact_days: number | null
  status: ApprovalStatus
  sent_at: string | null
  decision_at: string | null
  decision_by_name: string | null
  decision_method: string | null
  decision_note: string | null
  can_decide: boolean
}

export type ApprovalHistoryEntry = {
  decision: ApprovalDecision
  revision: number
  comment: string | null
  decided_by_name: string
  decided_at: string
  amount_cents: number
}

export type ApprovalLine = ClientPricingLine

type ApprovalDetailBase = {
  id: string
  project_id: string
  project_name: string
  number: string
  title: string
  description: string | null
  revision: number
  amount_cents: number
  status: ApprovalStatus
  sent_at: string | null
  decision_at: string | null
  decision_by_name: string | null
  decision_method: string | null
  decision_note: string | null
  can_sign: boolean
  signature_in_progress: boolean
  history: ApprovalHistoryEntry[]
  lines: ApprovalLine[]
}

export type EstimateApprovalDetail = ApprovalDetailBase & {
  document_type: 'estimate'
  estimate_date: string | null
  expiration_date: string | null
  /** Client-safe: no internal costs, markup, or contingency ever reach the portal. */
  pricing_display: PricingDisplay
  categories: ClientPricingCategory[]
  proposal: ProposalText
  totals: {
    construction_total_cents: number
    allowance_cents: number
    land_cost_cents: number | null
    total_with_land_cents: number
  }
}

export type ChangeOrderApprovalDetail = ApprovalDetailBase & {
  document_type: 'change_order'
  reason: string | null
  schedule_impact_days: number | null
  contract: { original_cents: number | null; approved_changes_cents: number; current_cents: number | null }
}

export type ApprovalDetail = EstimateApprovalDetail | ChangeOrderApprovalDetail

export function isApprovalDocumentType(value: string): value is ApprovalDocumentType {
  return (APPROVAL_DOCUMENT_TYPES as readonly string[]).includes(value)
}

export function approvalHref(type: ApprovalDocumentType, id: string) {
  return `/portal/approvals/${type}/${id}`
}

export function formatScheduleImpact(days: number | null): string {
  if (days === null || days === 0) return 'No schedule change'
  const n = Math.abs(days)
  return `${days > 0 ? 'Adds' : 'Saves'} ${n} ${n === 1 ? 'day' : 'days'}`
}

export function formatSignedCents(cents: number, format: (c: number) => string): string {
  if (cents === 0) return format(0)
  return `${cents > 0 ? '+' : '−'}${format(Math.abs(cents))}`
}
