import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankDraft, hasMoreDetails, isDraftTouched, matchesQuickFilter, matchesSearch, sortSelections, validateDraft } from './selection-drafts.ts'
import type { SelectionListRow } from './selections.ts'

const KEY = '11111111-1111-4111-8111-111111111111'
const draft = (over: Record<string, string> = {}) => ({ ...blankDraft(KEY), name: 'Kitchen faucet', category: 'Plumbing', ...over })

test('blank allowance stays null, zero stays zero', () => {
  assert.equal(validateDraft(draft()).value?.allowance_cents, null)
  assert.equal(validateDraft(draft({ allowance: '0' })).value?.allowance_cents, 0)
  assert.equal(validateDraft(draft({ allowance: '$1,250.50' })).value?.allowance_cents, 125050)
})

test('rejects negative or malformed allowances', () => {
  assert.ok(validateDraft(draft({ allowance: '-5' })).errors.allowance)
  assert.ok(validateDraft(draft({ allowance: 'abc' })).errors.allowance)
})

test('requires name and category; validates dates and request key', () => {
  const { errors } = validateDraft({ ...blankDraft(KEY) })
  assert.ok(errors.name && errors.category)
  assert.ok(validateDraft(draft({ due_date: '2026-02-30' })).errors.due_date)
  assert.equal(validateDraft(draft({ due_date: '2026-12-31' })).value?.due_date, '2026-12-31')
  assert.ok(validateDraft({ ...draft(), key: 'nope' }).errors.name)
})

test('blank optional text becomes null; internal notes are kept separate', () => {
  const v = validateDraft(draft({ notes: ' ', internal_notes: 'margin 20%' })).value!
  assert.equal(v.notes, null)
  assert.equal(v.internal_notes, 'margin 20%')
})

test('carry keeps only room and category', () => {
  const next = blankDraft(KEY, { category: 'Tile', location: 'Bath' })
  assert.equal(next.category, 'Tile')
  assert.equal(next.location, 'Bath')
  assert.equal(next.allowance, '')
  assert.equal(next.due_date, '')
  assert.equal(isDraftTouched(blankDraft(KEY)), false)
  assert.equal(isDraftTouched(next), true)
  assert.equal(hasMoreDetails(draft({ cost_code: '22-100' })), true)
})

const row = (over: Partial<SelectionListRow>): SelectionListRow => ({
  id: over.name ?? 'x',
  name: 'x',
  category: 'Plumbing',
  location: null,
  status: 'draft',
  allowance_cents: null,
  selected_price_cents: null,
  due_date: null,
  updated_at: '2026-01-01',
  ...over,
})

test('quick filters use existing statuses', () => {
  const today = new Date('2026-06-15T12:00:00Z')
  assert.equal(matchesQuickFilter(row({ status: 'awaiting_homeowner' }), 'needs_decision'), true)
  assert.equal(matchesQuickFilter(row({ status: 'approved' }), 'approved'), true)
  assert.equal(matchesQuickFilter(row({ status: 'awaiting_homeowner', due_date: '2026-06-01' }), 'overdue', today), true)
  assert.equal(matchesQuickFilter(row({ status: 'approved', due_date: '2026-06-01' }), 'overdue', today), false)
})

test('sorting sinks empty values and search covers room and category', () => {
  const rows = [row({ name: 'b', allowance_cents: null }), row({ name: 'a', allowance_cents: 500 }), row({ name: 'c', allowance_cents: 100 })]
  assert.deepEqual(sortSelections(rows, 'allowance_cents', 'desc').map((r) => r.name), ['a', 'c', 'b'])
  assert.deepEqual(sortSelections(rows, 'allowance_cents', 'asc').map((r) => r.name), ['c', 'a', 'b'])
  assert.equal(matchesSearch(row({ name: 'Faucet', location: 'Kitchen' }), 'kitch'), true)
  assert.equal(matchesSearch(row({ name: 'Faucet' }), 'tile'), false)
})
