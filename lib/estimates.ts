import type { StatusTone } from '@/components/shared/status-badge'

export const ESTIMATE_CATEGORIES = [
  'Site Preparation',
  'Survey and Engineering',
  'Permits',
  'Foundation',
  'Framing',
  'Roofing',
  'Plumbing',
  'Electrical',
  'HVAC',
  'Insulation',
  'Drywall',
  'Cabinets',
  'Countertops',
  'Flooring',
  'Painting',
  'Appliances',
  'Exterior Work',
  'Landscaping',
  'Management Fees',
  'Other',
] as const
export type EstimateCategory = (typeof ESTIMATE_CATEGORIES)[number]

export const ESTIMATE_STATUSES = ['draft', 'internal_review', 'submitted', 'approved', 'rejected'] as const
export type EstimateStatus = (typeof ESTIMATE_STATUSES)[number]

export const ESTIMATE_STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: 'Draft',
  internal_review: 'Internal review',
  submitted: 'Submitted to homeowner',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const ESTIMATE_STATUS_TONES: Record<EstimateStatus, StatusTone> = {
  draft: 'neutral',
  internal_review: 'sage',
  submitted: 'warning',
  approved: 'solid',
  rejected: 'danger',
}

export const DECISION_METHODS = ['in_person', 'email', 'phone', 'paper_signature', 'other'] as const
export const DECISION_METHOD_LABELS: Record<(typeof DECISION_METHODS)[number], string> = {
  in_person: 'In person',
  email: 'Email',
  phone: 'Phone',
  paper_signature: 'Signed paper copy',
  other: 'Other',
}

export const ESTIMATE_UNITS = ['ea', 'lot', 'sq ft', 'ln ft', 'cu yd', 'hr', 'day', 'allow'] as const

export function isEditableStatus(status: EstimateStatus) {
  return status === 'draft' || status === 'internal_review'
}

export type EstimateTotals = {
  material_cents: number
  labor_cents: number
  other_cents: number
  allowance_cents: number
  direct_cost_cents: number
  markup_cents: number
  contingency_cents: number
  construction_total_cents: number
  total_with_land_cents: number
  land_cost_cents: number | null
  markup_percent: number | string
  contingency_percent: number | string
}

export type EstimateLineItem = {
  id: string
  category: EstimateCategory
  description: string
  quantity: number | string
  unit: string
  material_unit_cents: number
  labor_unit_cents: number
  other_unit_cents: number
  is_allowance: boolean
  sort_order: number
  notes: string | null
  line_total_cents: number
}

/** Converts cents to a plain dollar string for form inputs ("1234.5" style, no grouping). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return ''
  const whole = Math.trunc(cents / 100)
  const frac = Math.abs(cents % 100)
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`
}

const currencyExact = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function formatCentsExact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return currencyExact.format(cents / 100)
}

export function formatPercent(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })}%`
}

export function formatQuantity(value: number | string): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 3 })
}
