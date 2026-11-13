import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ClientPricing, ProposalContent, ProposalTemplate, ProposalText, PricingDisplay } from '@/lib/proposals'

export type ProposalPreview = { proposal: ProposalContent; pricing: ClientPricing }

const toNumber = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function normalizePricing(raw: Record<string, unknown>): ClientPricing {
  const lines = (raw.lines as Record<string, unknown>[] | null) ?? []
  const categories = (raw.categories as Record<string, unknown>[] | null) ?? []
  return {
    lines: lines.map((l) => ({
      category: String(l.category),
      description: String(l.description),
      quantity: Number(l.quantity),
      unit: String(l.unit),
      is_allowance: Boolean(l.is_allowance),
      price_cents: Number(l.price_cents),
    })),
    categories: categories.map((c) => ({
      category: String(c.category),
      price_cents: Number(c.price_cents),
      allowance_cents: Number(c.allowance_cents),
      line_count: Number(c.line_count),
    })),
    construction_total_cents: Number(raw.construction_total_cents ?? 0),
    allowance_cents: Number(raw.allowance_cents ?? 0),
    land_cost_cents: toNumber(raw.land_cost_cents),
    total_with_land_cents: Number(raw.total_with_land_cents ?? 0),
  }
}

/** Exactly what the homeowner sees for an estimate, computed server-side. Null when the caller cannot view it. */
export async function getProposalPreview(estimateId: string): Promise<ProposalPreview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('proposal_preview', { p_estimate: estimateId })
  if (error) {
    console.error('[proposals] preview failed', error.message)
    return null
  }
  if (!data) return null
  const raw = data as { proposal: ProposalContent; pricing: Record<string, unknown> }
  return { proposal: raw.proposal, pricing: normalizePricing(raw.pricing) }
}

const TEMPLATE_COLUMNS =
  'id, name, pricing_display, introduction, exclusions, payment_terms, terms, acceptance_text, is_default, archived_at, updated_at'

export async function listProposalTemplates(organizationId: string, options: { includeArchived?: boolean } = {}): Promise<ProposalTemplate[]> {
  const supabase = await createClient()
  let query = supabase.from('proposal_templates').select(TEMPLATE_COLUMNS).eq('organization_id', organizationId)
  if (!options.includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query.order('is_default', { ascending: false }).order('name')
  if (error) {
    console.error('[proposals] templates failed', error.message)
    return []
  }
  return (data ?? []) as ProposalTemplate[]
}

export async function getStarterContent(): Promise<ProposalText & { name: string; pricing_display: PricingDisplay }> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('proposal_starter_content')
  return data as ProposalText & { name: string; pricing_display: PricingDisplay }
}
