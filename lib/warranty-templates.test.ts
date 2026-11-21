import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coverageKey,
  durationParts,
  formatDuration,
  parseCategories,
  parseReminderDays,
  toMonths,
  validateWarrantyTemplate,
  type WarrantyTemplateInput,
} from './warranty-templates.ts'

const base: WarrantyTemplateInput = {
  name: ' Smith Homes  Limited Warranty ',
  description: '',
  disclaimer: 'Coverage is governed by the written warranty agreement.',
  reminderDays: [7, 30, 0, 30],
  coverages: [
    { name: 'Workmanship', durationMonths: 12, categories: ['Paint', 'Trim'] },
    { name: 'Roof leaks', durationMonths: 60, categories: ['Roof'] },
  ],
}

test('helpers', () => {
  const used = new Set<string>()
  assert.equal(coverageKey('Roof leaks', used), 'roof_leaks')
  assert.equal(coverageKey('Roof  Leaks!', used), 'roof_leaks_2')
  assert.equal(coverageKey('?', used), 'coverage')
  assert.deepEqual(parseCategories('HVAC, Plumbing\nhvac\n\n Electrical '), ['HVAC', 'Plumbing', 'Electrical'])
  assert.deepEqual(parseReminderDays('7, 30 0'), [30, 7, 0])
  assert.equal(parseReminderDays('7, soon'), null)
  assert.equal(toMonths(2, 'years'), 24)
  assert.equal(formatDuration(12), '1 year')
  assert.equal(formatDuration(120), '10 years')
  assert.equal(formatDuration(18), '18 months')
  assert.deepEqual(durationParts(60), { value: 5, unit: 'years' })
  assert.deepEqual(durationParts(18), { value: 18, unit: 'months' })
})

test('validates and cleans a template', () => {
  const r = validateWarrantyTemplate(base)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.value.name, 'Smith Homes Limited Warranty')
  assert.equal(r.value.description, null)
  assert.deepEqual(r.value.reminderDays, [30, 7, 0])
  assert.deepEqual(r.value.coverages.map((c) => c.key), ['workmanship', 'roof_leaks'])
})

test('keeps existing coverage keys and avoids collisions with them', () => {
  const r = validateWarrantyTemplate({
    ...base,
    coverages: [
      { key: 'structural', name: 'Workmanship', durationMonths: 12, categories: ['A'] },
      { name: 'Structural', durationMonths: 120, categories: ['B'] },
    ],
  })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.value.coverages.map((c) => c.key), ['structural', 'structural_2'])
})

test('rejects bad input with a clear message', () => {
  const bad = (patch: Partial<WarrantyTemplateInput>) => {
    const r = validateWarrantyTemplate({ ...base, ...patch })
    assert.equal(r.ok, false)
    return r.ok ? '' : r.error
  }
  assert.match(bad({ name: 'x' }), /name/)
  assert.match(bad({ disclaimer: 'short' }), /note/)
  assert.match(bad({ reminderDays: [] }), /reminder/)
  assert.match(bad({ reminderDays: [400] }), /0 to 365/)
  assert.match(bad({ coverages: [] }), /at least one coverage/)
  assert.match(bad({ coverages: [{ name: 'Roof', durationMonths: 0, categories: ['R'] }] }), /length/)
  assert.match(bad({ coverages: [{ name: 'Roof', durationMonths: 12, categories: [] }] }), /at least one thing/)
  assert.match(
    bad({ coverages: [{ name: 'Roof', durationMonths: 12, categories: ['R'] }, { name: 'roof', durationMonths: 12, categories: ['R'] }] }),
    /Two coverages are named/,
  )
})
