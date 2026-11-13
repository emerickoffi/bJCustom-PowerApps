import { test } from 'node:test'
import assert from 'node:assert/strict'
import { closingSections, pricingRows, proposalFilename, proposalInputSchema, type ClientPricing } from './proposals.ts'

const pricing: ClientPricing = {
  lines: [
    { category: 'Framing', description: 'Wall framing', quantity: 1, unit: 'ls', is_allowance: false, price_cents: 1000_00 },
    { category: 'Finishes', description: 'Tile allowance', quantity: 1, unit: 'ls', is_allowance: true, price_cents: 500_00 },
  ],
  categories: [
    { category: 'Framing', price_cents: 1000_00, allowance_cents: 0, line_count: 1 },
    { category: 'Finishes', price_cents: 500_00, allowance_cents: 500_00, line_count: 1 },
  ],
  construction_total_cents: 1500_00,
  allowance_cents: 500_00,
  land_cost_cents: null,
  total_with_land_cents: 1500_00,
}

test('pricing rows follow the display mode and never invent amounts', () => {
  assert.deepEqual(pricingRows(pricing, 'total'), [])
  const byCategory = pricingRows(pricing, 'category')
  assert.equal(byCategory.length, 2)
  assert.equal(byCategory[1].detail, 'Includes allowances')
  const detailed = pricingRows(pricing, 'detailed')
  assert.equal(detailed[1].detail, 'Finishes · Allowance')
  assert.equal(detailed.reduce((s, r) => s + r.cents, 0), pricing.construction_total_cents)
})

test('closing sections skip blank content and keep document order', () => {
  const sections = closingSections({ introduction: 'Hi', exclusions: '  ', payment_terms: 'Net 10', terms: 'Terms', acceptance_text: null })
  assert.deepEqual(sections.map((s) => s.field), ['payment_terms', 'terms'])
})

test('proposal input trims text and turns blanks into null', () => {
  const parsed = proposalInputSchema.parse({
    template_id: null,
    title: '  Kitchen remodel ',
    pricing_display: 'category',
    show_scope: true,
    introduction: '   ',
    terms: ' Terms ',
  })
  assert.equal(parsed.title, 'Kitchen remodel')
  assert.equal(parsed.introduction, null)
  assert.equal(parsed.terms, 'Terms')
  assert.equal(parsed.exclusions, null)
})

test('proposal input rejects unknown display modes and empty titles', () => {
  assert.equal(proposalInputSchema.safeParse({ template_id: null, title: 'x', pricing_display: 'costs', show_scope: true }).success, false)
  assert.equal(proposalInputSchema.safeParse({ template_id: null, title: ' ', pricing_display: 'total', show_scope: true }).success, false)
})

test('proposal filenames are filesystem safe', () => {
  assert.equal(proposalFilename({ projectNumber: 'BJ 2026/01', estimateNumber: 'EST-0004', revision: 2 }), 'BJ-2026-01_EST-0004-Rev2_Proposal.pdf')
})
