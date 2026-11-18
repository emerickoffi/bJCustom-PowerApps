import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyLogVoiceDraft, isEmptyDailyLogDraft, type DailyLogVoiceModelOutput } from './voice-daily-log.ts'

const companies = [
  { value: 'c1', label: 'Smith Framing', trade: 'Framing' },
  { value: 'c2', label: 'Bright Electric', trade: 'Electrical' },
  { value: 'c3', label: 'Bright Plumbing', trade: 'Plumbing' },
]

function output(overrides: Partial<DailyLogVoiceModelOutput> = {}): DailyLogVoiceModelOutput {
  return {
    weather_conditions: '',
    temperature_f: null,
    weather_impact: '',
    site_conditions: '',
    work_performed: '',
    progress_notes: '',
    work_planned_next: '',
    materials_delivered: '',
    equipment_used: '',
    delivery_notes: '',
    delay_description: '',
    delay_reason: '',
    delay_impact: '',
    corrective_actions: '',
    safety_observations: '',
    crews: [],
    ...overrides,
  }
}

test('keeps only stated text fields, trimmed and capped to the table limits', () => {
  const draft = buildDailyLogVoiceDraft(output({ work_performed: '  Framed second floor walls. ', weather_conditions: 'x'.repeat(500) }), companies)
  assert.equal(draft.fields.work_performed, 'Framed second floor walls.')
  assert.equal(draft.fields.weather_conditions?.length, 200)
  assert.equal('site_conditions' in draft.fields, false)
})

test('drops a delay reason or impact that has no delay description', () => {
  const orphan = buildDailyLogVoiceDraft(output({ delay_reason: 'Rain', delay_impact: 'Half day' }), companies)
  assert.equal(orphan.fields.delay_reason, undefined)
  assert.equal(orphan.fields.delay_impact, undefined)
  const full = buildDailyLogVoiceDraft(output({ delay_description: 'Rain stopped roofing', delay_reason: 'Rain' }), companies)
  assert.equal(full.fields.delay_reason, 'Rain')
})

test('rounds temperature and rejects impossible values', () => {
  assert.equal(buildDailyLogVoiceDraft(output({ temperature_f: 71.6 }), companies).temperature_f, '72')
  assert.equal(buildDailyLogVoiceDraft(output({ temperature_f: 400 }), companies).temperature_f, '')
  assert.equal(buildDailyLogVoiceDraft(output({ temperature_f: null }), companies).temperature_f, '')
})

test('links a crew to a company only when exactly one active company matches', () => {
  const draft = buildDailyLogVoiceDraft(
    output({
      crews: [
        { trade: '', companyMention: 'Smith Framing', crewSize: 6, hours: 8, notes: '' },
        { trade: 'Electrical', companyMention: 'Bright', crewSize: 2.4, hours: 7.5, notes: 'Rough-in' },
        { trade: 'Drywall', companyMention: 'Unknown Co', crewSize: -3, hours: null, notes: '' },
      ],
    }),
    companies,
  )
  assert.deepEqual(
    draft.crews.map((c) => [c.trade, c.subcontractor_company_id, c.crew_size, c.hours_worked, c.companyChoices.map((x) => x.value)]),
    [
      ['Framing', 'c1', '6', '8', []],
      ['Electrical', '', '2', '7.5', ['c2', 'c3']],
      ['Drywall', '', '', '', []],
    ],
  )
})

test('skips crews with no trade or company and reports empty drafts', () => {
  const draft = buildDailyLogVoiceDraft(output({ crews: [{ trade: ' ', companyMention: null, crewSize: 3, hours: null, notes: '' }] }), companies)
  assert.equal(draft.crews.length, 0)
  assert.equal(isEmptyDailyLogDraft(draft), true)
})
