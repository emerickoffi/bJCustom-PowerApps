import { z } from 'zod'

/**
 * Proposals are the customer-facing presentation of one estimate revision. The estimate is the only
 * financial source of truth; proposals carry narrative content and presentation choices. Customer
 * prices come from the database (`estimate_client_pricing_json`), which allocates markup and
 * contingency onto lines so builder costs and percentages never reach homeowners.
 */

export const PRICING_DISPLAYS = ['category', 'detailed', 'total'] as const
export type PricingDisplay = (typeof PRICING_DISPLAYS)[number]

export const PRICING_DISPLAY_LABELS: Record<PricingDisplay, string> = {
  category: 'By category',
  detailed: 'Itemized',
  total: 'Total only',
}

export const PRICING_DISPLAY_DESCRIPTIONS: Record<PricingDisplay, string> = {
  category: 'One price per trade category. Recommended for most homeowners.',
  detailed: 'Every line item with its customer price. No builder costs are shown.',
  total: 'A single construction total.',
}

export const PROPOSAL_TEXT_FIELDS = ['introduction', 'exclusions', 'payment_terms', 'terms', 'acceptance_text'] as const
export type ProposalTextField = (typeof PROPOSAL_TEXT_FIELDS)[number]

export const PROPOSAL_TEXT_LABELS: Record<ProposalTextField, string> = {
  introduction: 'Introduction',
  exclusions: 'Exclusions',
  payment_terms: 'Payment terms',
  terms: 'Terms and conditions',
  acceptance_text: 'Acceptance statement',
}

export const PROPOSAL_TEXT_LIMITS: Record<ProposalTextField, number> = {
  introduction: 5000,
  exclusions: 10000,
  payment_terms: 5000,
  terms: 20000,
  acceptance_text: 2000,
}

export type ProposalText = Record<ProposalTextField, string | null>

export type ProposalContent = ProposalText & {
  saved: boolean
  template_id: string | null
  template_name: string | null
  title: string
  pricing_display: PricingDisplay
  show_scope: boolean
  updated_at: string | null
}

export type ClientPricingLine = {
  category: string
  description: string
  quantity: number
  unit: string
  is_allowance: boolean
  price_cents: number
}

export type ClientPricingCategory = {
  category: string
  price_cents: number
  allowance_cents: number
  line_count: number
}

export type ClientPricing = {
  lines: ClientPricingLine[]
  categories: ClientPricingCategory[]
  construction_total_cents: number
  allowance_cents: number
  land_cost_cents: number | null
  total_with_land_cents: number
}

export type ProposalTemplate = ProposalText & {
  id: string
  name: string
  pricing_display: PricingDisplay
  is_default: boolean
  archived_at: string | null
  updated_at: string
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Keep this under ${max.toLocaleString()} characters`)
    .transform((v) => (v.trim() ? v.trim() : null))
    .nullable()
    .optional()
    .transform((v) => v ?? null)

const textShape = {
  introduction: optionalText(PROPOSAL_TEXT_LIMITS.introduction),
  exclusions: optionalText(PROPOSAL_TEXT_LIMITS.exclusions),
  payment_terms: optionalText(PROPOSAL_TEXT_LIMITS.payment_terms),
  terms: optionalText(PROPOSAL_TEXT_LIMITS.terms),
  acceptance_text: optionalText(PROPOSAL_TEXT_LIMITS.acceptance_text),
}

export const proposalInputSchema = z.object({
  template_id: z.uuid().nullable(),
  title: z.string().trim().min(1, 'Add a proposal title').max(200, 'Keep the title under 200 characters'),
  pricing_display: z.enum(PRICING_DISPLAYS),
  show_scope: z.boolean(),
  ...textShape,
})
export type ProposalInput = z.input<typeof proposalInputSchema>

export const templateInputSchema = z.object({
  name: z.string().trim().min(1, 'Name the template').max(120, 'Keep the name under 120 characters'),
  pricing_display: z.enum(PRICING_DISPLAYS),
  ...textShape,
})
export type TemplateInput = z.input<typeof templateInputSchema>

/** Customer-facing sections that appear after pricing, in document order. Empty sections are omitted. */
export function closingSections(content: ProposalText): { field: ProposalTextField; heading: string; body: string }[] {
  return (['exclusions', 'payment_terms', 'terms'] as const)
    .map((field) => ({ field, heading: PROPOSAL_TEXT_LABELS[field], body: content[field]?.trim() ?? '' }))
    .filter((s) => s.body.length > 0)
}

/** Pricing rows the customer sees for a display mode. Totals always come from the estimate. */
export function pricingRows(pricing: ClientPricing, display: PricingDisplay): { label: string; detail: string | null; cents: number }[] {
  if (display === 'total') return []
  if (display === 'category') {
    return pricing.categories.map((c) => ({
      label: c.category,
      detail: c.allowance_cents > 0 ? 'Includes allowances' : null,
      cents: c.price_cents,
    }))
  }
  return pricing.lines.map((l) => ({
    label: l.description,
    detail: `${l.category}${l.is_allowance ? ' · Allowance' : ''}`,
    cents: l.price_cents,
  }))
}

export function proposalFilename(input: { projectNumber: string | null; estimateNumber: string; revision: number }): string {
  const base = [input.projectNumber, `${input.estimateNumber}-Rev${input.revision}`, 'Proposal'].filter(Boolean).join('_')
  return `${base.replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`
}
