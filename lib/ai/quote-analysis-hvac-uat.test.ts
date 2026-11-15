import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, payableCents, type QuoteRevision } from '../subcontract-quotes.ts'
import {
  buildSources,
  expiredSinceAnalysis,
  inputSnapshot,
  missingFields,
  outdatedReasons,
  validateAnalysis,
  type AnalysisInput,
  type AnalysisQuoteInput,
  type QualificationSnapshot,
} from './quote-analysis.ts'

const id = (n: number) => `9a1b2c3d-0000-4000-8000-${String(n).padStart(12, '0')}`
const [INV_A, INV_B, INV_C] = [id(1), id(2), id(3)]

const qualified: QualificationSnapshot = { label: 'Qualified', vetting: 'qualified', status: 'active', decision: null, missing: 0, expired: 0, awaiting_review: 0, next_expiration: null }
const incomplete: QualificationSnapshot = { ...qualified, label: 'Missing documents', vetting: 'incomplete', missing: 2 }

function rev(n: number, invitation_id: string, over: Partial<QuoteRevision>): QuoteRevision {
  return {
    id: id(100 + n),
    invitation_id,
    subcontractor_company_id: id(200 + n),
    revision_number: 1,
    status: 'submitted',
    scope_version: 2,
    amount_cents: null,
    tax_treatment: 'included',
    tax_amount_cents: null,
    tax_details: null,
    inclusions: null,
    exclusions: null,
    availability: null,
    allowances: null,
    assumptions: null,
    alternates: [],
    estimated_duration_days: null,
    valid_until: null,
    row_version: 1,
    submitted_at: '2026-11-05T15:00:00Z',
    ...over,
  }
}

const quote = (q: Omit<AnalysisQuoteInput, 'outdatedScope' | 'revisionOutstanding'> & Partial<AnalysisQuoteInput>): AnalysisQuoteInput => ({
  outdatedScope: false,
  revisionOutstanding: false,
  ...q,
})

/** Three HVAC quotes with deliberately different prices, tax handling, exclusions, availability, and qualification. */
function hvacInput(): AnalysisInput {
  return {
    title: 'HVAC rough-in and equipment',
    trade: 'HVAC',
    currency: 'USD',
    scopeVersion: 2,
    scopeText: 'Supply and install two-stage furnace, condenser, ductwork, and thermostat for a 2,400 sq ft home.',
    scopeDocuments: [{ name: 'Mechanical plan M-1.pdf', version_number: 2 }],
    workWindow: { start: '2026-12-01', end: '2026-12-19' },
    quotes: [
      quote({
        invitationId: INV_A,
        company: 'Northwind Heating',
        revision: rev(1, INV_A, {
          amount_cents: 1_850_000,
          tax_treatment: 'included',
          inclusions: 'Furnace, condenser, ductwork, thermostat, startup',
          exclusions: 'Electrical disconnect',
          availability: 'Can start December 1',
          estimated_duration_days: 12,
          valid_until: '2026-12-31',
        }),
        attachments: [{ id: id(301), file_name: 'northwind-quote.pdf' }],
        qualification: qualified,
        expired: false,
      }),
      quote({
        invitationId: INV_B,
        company: 'Budget Air Co',
        revision: rev(2, INV_B, {
          amount_cents: 1_690_000,
          tax_treatment: 'excluded',
          tax_amount_cents: null,
          inclusions: 'Furnace, condenser, ductwork',
          exclusions: 'Thermostat, permits, electrical',
          availability: 'Earliest start January 12',
          estimated_duration_days: 15,
          valid_until: '2026-11-10',
        }),
        attachments: [],
        qualification: incomplete,
        expired: true,
      }),
      quote({
        invitationId: INV_C,
        company: 'Summit Mechanical',
        revision: rev(3, INV_C, {
          amount_cents: 1_920_000,
          tax_treatment: 'excluded',
          tax_amount_cents: 120_000,
          inclusions: 'Furnace, condenser, ductwork, smart thermostat, permits',
          exclusions: null,
          availability: 'Can start December 3',
          estimated_duration_days: 10,
          valid_until: '2027-01-15',
          alternates: [{ description: 'Variable-speed condenser upgrade', amount_cents: '240000' }],
        }),
        attachments: [],
        qualification: qualified,
        expired: false,
      }),
    ],
  }
}

test('HVAC UAT: verified payable totals use app calculations and keep unknown tax unknown', () => {
  const input = hvacInput()
  const s = buildSources(input)
  assert.equal(s.get('Q1.total_payable')?.excerpt, formatMoney('1850000', 'USD'))
  assert.equal(s.get('Q2.total_payable')?.excerpt, 'Not determinable from the submitted values')
  assert.match(s.get('Q2.tax')?.excerpt ?? '', /unknown \(not zero\)/)
  assert.equal(s.get('Q3.total_payable')?.excerpt, formatMoney('2040000', 'USD'))
  assert.equal(payableCents(input.quotes[1].revision), null)
  // Alternates are listed separately and never folded into the total.
  assert.match(s.get('Q3.alternates')?.excerpt ?? '', /Variable-speed condenser upgrade/)
  // Differences only exist where both totals are verified.
  assert.ok(s.has('CALC.diff_Q1_Q3'))
  assert.ok(!s.has('CALC.diff_Q1_Q2'))
  assert.ok(!s.has('CALC.diff_Q2_Q3'))
  assert.match(s.get('CALC.diff_Q1_Q3')?.excerpt ?? '', new RegExp(`= -${formatMoney('190000', 'USD').replace('$', '\\$')}`))
})

test('HVAC UAT: expiry, qualification, scope gaps, and unread files are surfaced from records', () => {
  const s = buildSources(hvacInput())
  assert.match(s.get('Q2.valid_until')?.excerpt ?? '', /\(expired\)/)
  assert.match(s.get('Q2.qualification')?.excerpt ?? '', /Missing documents; mandatory items missing 2/)
  assert.equal(s.get('Q3.exclusions')?.excerpt, 'None listed')
  assert.match(s.get('Q1.att1')?.excerpt ?? '', /Contents not read/)
  assert.match(s.get('SCOPE.doc1')?.excerpt ?? '', /Contents not read/)
  assert.deepEqual(missingFields(hvacInput().quotes[1]), ['Tax amount (excluded tax is unknown)'])
})

test('HVAC UAT: invented savings, uncited claims, and unsupported picks are removed', () => {
  const input = hvacInput()
  const raw = {
    summary: [
      { text: 'Budget Air Co is lowest at $16,900 before unknown tax.', basis: 'submitted_fact', sources: ['Q2.base_amount', 'Q2.tax'] },
      { text: 'Choosing Budget Air saves $1,600.', basis: 'interpretation', sources: ['Q2.base_amount'] },
      { text: 'Summit is the best contractor overall.', basis: 'interpretation', sources: [] },
      { text: 'Total installed cost for Budget Air is about $18,000.', basis: 'interpretation', sources: ['Q2.total_payable'] },
    ],
    differences: [{ text: 'Only Northwind and Summit include a thermostat.', basis: 'interpretation', sources: ['Q1.inclusions', 'Q2.exclusions', 'Q3.inclusions'] }],
    scope_gaps: [],
    allowances_uncertain: [],
    availability: [{ text: 'Budget Air cannot start until January 12, after the work window.', basis: 'interpretation', sources: ['Q2.availability', 'SCOPE.work_window'] }],
    questions: [{ quote: 'Q2', items: [{ text: 'What is the sales tax amount on this quote?', sources: ['Q2.tax'] }] }],
    recommendation: { status: 'supported', quote: 'Q2', rationale: [{ text: 'Cheapest.', basis: 'interpretation', sources: [] }], tradeoffs: [] },
  }
  const r = validateAnalysis(raw, input)
  assert.deepEqual(r.sections.summary.map((p) => p.text), ['Budget Air Co is lowest at $16,900 before unknown tax.'])
  assert.equal(r.removed.prohibited_claims, 1)
  assert.equal(r.removed.unverified_figures, 1)
  assert.ok(r.removed.unsupported >= 2)
  assert.equal(r.recommendation.status, 'insufficient_evidence')
  assert.equal(r.recommendation.invitation_id, null)
  assert.equal(r.questions[0].company, 'Budget Air Co')
  assert.equal(r.quotes[1].total_payable, null)
  assert.equal(r.unread_documents.length, 2)
  // Every kept point traces to submitted fields.
  for (const p of r.sections.differences) assert.ok(p.evidence.every((e) => e.field && e.excerpt))
})

test('HVAC UAT: revisions, qualification changes, and scope changes make a saved analysis outdated', () => {
  const saved = inputSnapshot(hvacInput())
  const next = hvacInput()
  next.scopeVersion = 3
  next.quotes[0].revision = { ...next.quotes[0].revision, id: id(111), revision_number: 2 }
  next.quotes[2].qualification = { ...qualified, expired: 1, label: 'Expired documents' }
  const reasons = outdatedReasons(saved, inputSnapshot(next))
  assert.deepEqual(reasons, [
    'Scope changed from v2 to v3.',
    'Northwind Heating: a newer quote revision was submitted.',
    'Summit Mechanical: qualification records changed.',
  ])
  assert.deepEqual(outdatedReasons(saved, inputSnapshot(hvacInput())), [])
})

test('expiredSinceAnalysis flags only quotes that lapsed after the analysis ran', () => {
  const quotes = [
    { company: 'Northwind Heating', valid_until: '2026-11-20' },
    { company: 'Budget Air Co', valid_until: '2026-11-01' },
    { company: 'Summit Mechanical', valid_until: '2027-01-15' },
    { company: 'No date', valid_until: null },
  ]
  assert.deepEqual(expiredSinceAnalysis('2026-11-05T15:00:00Z', quotes, '2026-11-25'), ['Northwind Heating: quote expired on 2026-11-20, after this analysis.'])
  assert.deepEqual(expiredSinceAnalysis('2026-11-05T15:00:00Z', quotes, '2026-11-14'), [])
})
