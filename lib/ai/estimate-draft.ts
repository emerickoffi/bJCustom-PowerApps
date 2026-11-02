import { z } from 'zod'
import { ESTIMATE_CATEGORIES, ESTIMATE_UNITS } from '@/lib/estimates'

/**
 * Shared model for assistant-proposed estimate drafts. The AI only proposes these
 * fields; every amount below is calculated here with the same integer-cent rules the
 * database triggers use, and the server re-validates before saving.
 */

export const COST_TYPES = ['material', 'labor', 'other'] as const
export type CostType = (typeof COST_TYPES)[number]
export const COST_TYPE_LABELS: Record<CostType, string> = { material: 'Material', labor: 'Labor', other: 'Other' }

export const AMOUNT_BASES = ['cost', 'selling_price', 'unknown'] as const
export type AmountBasis = (typeof AMOUNT_BASES)[number]

export const PERCENT_KINDS = ['markup', 'margin', 'unknown'] as const
export const MARKUP_SCOPES = ['all', 'some', 'unknown'] as const

const MONEY = /^\d{1,10}(\.\d{1,2})?$/
const QTY = /^\d{1,9}(\.\d{1,3})?$/
const PCT = /^\d{1,4}(\.\d{1,3})?$/

const optionalNumberText = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[$,%\s]/g, ''))
    .refine((v) => v === '' || pattern.test(v), message)
    .nullable()
    .transform((v) => (v ? v : null))

export const draftItemSchema = z.object({
  description: z.string().trim().min(1, 'Each line needs a description').max(500),
  category: z.enum(ESTIMATE_CATEGORIES),
  cost_type: z.enum(COST_TYPES),
  quantity: optionalNumberText(QTY, 'Quantity must be a number with up to 3 decimals'),
  unit: z.enum(ESTIMATE_UNITS),
  unit_cost: optionalNumberText(MONEY, 'Unit cost must be a dollar amount'),
  lump_sum: z.boolean(),
  source_text: z.string().trim().max(300).nullable(),
})
export type DraftItem = z.infer<typeof draftItemSchema>

export const draftSchema = z.object({
  title: z.string().trim().max(200),
  description: z.string().trim().max(4000).nullable(),
  notes: z.string().trim().max(5000).nullable(),
  amount_basis: z.enum(AMOUNT_BASES),
  percent: optionalNumberText(PCT, 'Markup must be a percentage'),
  percent_kind: z.enum(PERCENT_KINDS),
  markup_scope: z.enum(MARKUP_SCOPES),
  tax_percent: optionalNumberText(PCT, 'Tax must be a percentage'),
  stated_total: optionalNumberText(MONEY, 'Stated total must be a dollar amount'),
  ignored_lines: z.array(z.string().trim().max(200)).max(10),
  items: z.array(draftItemSchema).max(200),
})
export type EstimateDraft = z.infer<typeof draftSchema>

export type DraftProject = { id: string; name: string; number: string | null }

/** What the server sends the chat: the proposal plus the projects the user may pick from. */
export type DraftProposal = {
  draft: EstimateDraft
  project: DraftProject | null
  projectOptions: DraftProject[]
  projectNote: string | null
}

export const toCents = (dollars: string) => {
  const [whole, frac = ''] = dollars.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}
const toMilli = (value: string) => {
  const [whole, frac = ''] = value.split('.')
  return Number(whole) * 1000 + Number(frac.padEnd(3, '0'))
}

/** Matches the database: round(quantity × unit cents), and round(direct × markup / 100). */
export function lineTotalCents(item: Pick<DraftItem, 'quantity' | 'unit_cost'>): number | null {
  if (!item.quantity || !item.unit_cost) return null
  return Math.round((toMilli(item.quantity) * toCents(item.unit_cost)) / 1000)
}

export type DraftIssue = { level: 'block' | 'warn'; message: string }

export type DraftCalculation = {
  lines: (number | null)[]
  costSubtotalCents: number | null
  markupPercent: string
  markupCents: number | null
  sellingCents: number | null
  issues: DraftIssue[]
}

export function calculateDraft(draft: EstimateDraft, project: DraftProject | null): DraftCalculation {
  const issues: DraftIssue[] = []
  if (!project) issues.push({ level: 'block', message: 'Select the project this estimate belongs to.' })
  if (!draft.title.trim()) issues.push({ level: 'block', message: 'Add an estimate title.' })
  if (!draft.items.length) issues.push({ level: 'block', message: 'Add at least one line item.' })

  const lines = draft.items.map(lineTotalCents)
  draft.items.forEach((item, i) => {
    const label = item.description.trim() || `Line ${i + 1}`
    if (!item.unit_cost) issues.push({ level: 'block', message: `${label}: the amount is missing.` })
    if (!item.quantity) issues.push({ level: 'block', message: `${label}: the quantity is missing.` })
    else if (toMilli(item.quantity) === 0) issues.push({ level: 'block', message: `${label}: quantity must be greater than zero.` })
  })

  if (draft.amount_basis === 'unknown') {
    issues.push({ level: 'block', message: 'Confirm whether the amounts are builder costs or homeowner selling prices.' })
  }

  const hasPercent = draft.percent !== null && toMilli(draft.percent) > 0
  let markupPercent = '0'
  if (hasPercent) {
    if (draft.amount_basis === 'selling_price') {
      issues.push({ level: 'block', message: 'These amounts are selling prices, so markup would be applied twice. Remove the markup or mark the amounts as costs.' })
    } else if (draft.percent_kind === 'margin') {
      issues.push({ level: 'block', message: 'Estimates apply markup (cost × (1 + markup %)), not margin. Enter the equivalent markup percentage.' })
    } else if (draft.percent_kind === 'unknown') {
      issues.push({ level: 'block', message: 'Confirm whether the percentage is markup or margin.' })
    } else if (draft.markup_scope !== 'all') {
      issues.push({
        level: 'block',
        message:
          draft.markup_scope === 'some'
            ? 'Estimates apply one markup to every line. Remove the markup or apply it to all items.'
            : 'Confirm which items the markup applies to.',
      })
    } else {
      markupPercent = draft.percent!
    }
  }

  if (draft.tax_percent && toMilli(draft.tax_percent) > 0) {
    issues.push({ level: 'warn', message: `Tax (${draft.tax_percent}%) is not part of estimates and is not included in these totals.` })
  }
  for (const line of draft.ignored_lines) issues.push({ level: 'warn', message: `Not imported as a line item: "${line}".` })

  const complete = lines.every((l): l is number => l !== null)
  const costSubtotalCents = complete && lines.length ? lines.reduce((a, b) => a + b, 0) : null
  const markupCents = costSubtotalCents === null ? null : Math.round((costSubtotalCents * toMilli(markupPercent)) / 100000)
  const sellingCents = costSubtotalCents === null || markupCents === null ? null : costSubtotalCents + markupCents

  if (draft.stated_total && sellingCents !== null) {
    const stated = toCents(draft.stated_total)
    if (stated !== sellingCents && stated !== costSubtotalCents) {
      issues.push({
        level: 'warn',
        message: `The total in your text ($${Number(draft.stated_total).toLocaleString('en-US', { minimumFractionDigits: 2 })}) does not match the calculated total. Check the line items.`,
      })
    }
  }

  return { lines, costSubtotalCents, markupPercent, markupCents, sellingCents, issues }
}

/** Line items in the database's shape; only called once every amount is present. */
export function toLineItemRows(draft: EstimateDraft) {
  return draft.items.map((item) => {
    const cents = toCents(item.unit_cost!)
    return {
      category: item.category,
      description: item.description,
      quantity: item.lump_sum ? '1' : item.quantity!,
      unit: item.lump_sum ? 'lot' : item.unit,
      material_unit_cents: item.cost_type === 'material' ? cents : 0,
      labor_unit_cents: item.cost_type === 'labor' ? cents : 0,
      other_unit_cents: item.cost_type === 'other' ? cents : 0,
      notes: item.lump_sum ? 'Lump sum' : null,
    }
  })
}
