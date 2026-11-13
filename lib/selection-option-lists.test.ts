import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_SELECTION_CATEGORIES,
  DEFAULT_SELECTION_LOCATIONS,
  categoryChoices,
  checkCategoryName,
  filterOptions,
  findOption,
  locationChoices,
  mergeOptionLists,
  normalizeOptionName,
  optionKey,
  type CategoryRecord,
} from './selection-option-lists.ts'

const rec = (name: string, archived = false, id = name): CategoryRecord => ({ id, name, archived })

test('normalizes spacing without changing the spelling', () => {
  assert.equal(normalizeOptionName('  Tile   &\tBacksplash  '), 'Tile & Backsplash')
  assert.equal(optionKey(' PLUMBING  fixtures '), 'plumbing fixtures')
})

test('findOption matches regardless of capitalization and spacing', () => {
  assert.equal(findOption(['Plumbing Fixtures', 'Flooring'], ' plumbing   FIXTURES'), 'Plumbing Fixtures')
  assert.equal(findOption(['Flooring'], 'Floor'), undefined)
  assert.equal(findOption(['Flooring'], '   '), undefined)
})

test('mergeOptionLists dedupes case-insensitively, sorts, and keeps Other last', () => {
  assert.deepEqual(mergeOptionLists(['Other', 'kitchen', 'Bath'], ['Kitchen', null, '', ' Attic ']), ['Attic', 'Bath', 'kitchen', 'Other'])
})

test('company without saved categories gets the built-in defaults', () => {
  const choices = categoryChoices([])
  assert.equal(choices.length, DEFAULT_SELECTION_CATEGORIES.length)
  assert.equal(choices.at(-1), 'Other')
  assert.ok(choices.includes('Lighting & Electrical'))
})

test('saved categories replace the defaults and hide deactivated ones', () => {
  const choices = categoryChoices([rec('Flooring', true), rec('Floors'), rec('Millwork')])
  assert.deepEqual(choices, ['Floors', 'Millwork'])
})

test('regression: renaming a default category does not resurrect the old default spelling', () => {
  assert.ok(!categoryChoices([rec('Hard Surfaces', false, 'flooring-id')]).includes('Flooring'))
})

test('location choices keep previously entered custom rooms alongside defaults', () => {
  const choices = locationChoices(['Mudroom', 'kitchen', null, '  Bonus   Room '])
  assert.ok(choices.includes('Mudroom'))
  assert.ok(choices.includes('Bonus Room'))
  assert.equal(choices.filter((c) => c.toLowerCase() === 'kitchen').length, 1)
  assert.equal(choices.length, DEFAULT_SELECTION_LOCATIONS.length + 2)
})

test('filterOptions ranks prefix matches before substring matches', () => {
  assert.deepEqual(filterOptions(['Guest Bathroom', 'Bathroom Fixtures', 'Kitchen'], 'bath'), ['Bathroom Fixtures', 'Guest Bathroom'])
  assert.equal(filterOptions(['A', 'B'], '  ').length, 2)
})

test('checkCategoryName returns the existing record instead of creating a duplicate', () => {
  const result = checkCategoryName('  plumbing   FIXTURES ', [rec('Plumbing Fixtures')])
  assert.equal(result.ok, true)
  assert.equal(result.ok && result.existing?.name, 'Plumbing Fixtures')
})

test('checkCategoryName accepts and normalizes a new name', () => {
  const result = checkCategoryName('  Smart   Home ', [rec('Flooring')])
  assert.deepEqual(result, { ok: true, name: 'Smart Home', existing: null })
})

test('checkCategoryName rejects deactivated duplicates and bad lengths', () => {
  const archived = checkCategoryName('flooring', [rec('Flooring', true)])
  assert.equal(archived.ok, false)
  assert.match(!archived.ok ? archived.error : '', /deactivated/)
  assert.equal(checkCategoryName(' a ', []).ok, false)
  assert.equal(checkCategoryName('x'.repeat(61), []).ok, false)
})

test('checkCategoryName ignores the record being renamed', () => {
  const result = checkCategoryName('FLOORING', [rec('Flooring', false, 'f1')], 'f1')
  assert.deepEqual(result, { ok: true, name: 'FLOORING', existing: null })
  const clash = checkCategoryName('Tile', [rec('Flooring', false, 'f1'), rec('Tile', false, 't1')], 'f1')
  assert.equal(clash.ok && clash.existing?.id, 't1')
})
