import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChecklistPayload,
  checklistSummary,
  findChecklistProblem,
  previewItemNumbers,
  suggestTitle,
  type BuilderSection,
} from './walkthrough-builder.ts'

const item = (key: string, label: string, number = '', location = '') => ({ key, label, number, location })

const sections = (): BuilderSection[] => [
  { key: 's1', category: 'Exterior', items: [item('a', 'Siding'), item('b', 'Roof', '', 'Garage')] },
  { key: 's2', category: 'Kitchen', items: [item('c', 'Cabinets', '10.5'), item('d', 'Sink')] },
]

test('summary counts items and sections with plurals', () => {
  assert.equal(checklistSummary(sections()), '4 items across 2 sections')
  assert.equal(checklistSummary([{ key: 's', category: 'A', items: [item('x', 'One')] }]), '1 item across 1 section')
  const removed = sections()
  removed[0].items.pop()
  assert.equal(checklistSummary(removed), '3 items across 2 sections')
})

test('title suggestion never overwrites a manually edited title', () => {
  assert.equal(suggestTitle('warranty_30', 'Final homeowner walkthrough', false), '30-day warranty walkthrough')
  assert.equal(suggestTitle('warranty_30', 'Smith punch walk', true), 'Smith punch walk')
  assert.equal(suggestTitle('other', 'Keep me', false), 'Keep me')
})

test('preview numbering keeps custom numbers and auto-fills the rest', () => {
  const n = previewItemNumbers(sections())
  assert.deepEqual([n.get('a'), n.get('b'), n.get('c'), n.get('d')], ['11', '12', '10.5', '13'])
})

test('payload preserves custom numbers and locations in the server format', () => {
  assert.deepEqual(buildChecklistPayload(sections())[1], { category: 'Exterior', label: 'Roof', item_number: undefined, location: 'Garage' })
  assert.equal(buildChecklistPayload(sections())[2].item_number, '10.5')
})

test('first problem points at the field to fix', () => {
  assert.equal(findChecklistProblem(sections()), null)
  const unnamed = sections()
  unnamed[1].category = ' '
  assert.deepEqual(findChecklistProblem(unnamed), { kind: 'section', sectionKey: 's2', message: 'Name this section' })
  const blank = sections()
  blank[0].items[1].label = ''
  assert.equal(findChecklistProblem(blank)?.kind, 'item')
  assert.equal(findChecklistProblem([{ key: 's', category: 'A', items: [] }])?.kind, 'empty')
})
