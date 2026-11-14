import { test } from 'node:test'
import assert from 'node:assert/strict'
import { attentionState, listSources } from './overview-status.ts'

test('an empty list with every source loaded is confirmed clear', () => {
  assert.equal(attentionState({ itemCount: 0, ownFailed: false, relatedFailed: [] }), 'clear')
})

test('an empty list never reads as clear when its own sources failed', () => {
  assert.equal(attentionState({ itemCount: 0, ownFailed: true, relatedFailed: [] }), 'unavailable')
  assert.equal(attentionState({ itemCount: 0, ownFailed: true, relatedFailed: ['Questions (RFIs)'] }), 'unavailable')
})

test('a related source failure downgrades "No pending actions" to partial', () => {
  assert.equal(attentionState({ itemCount: 0, ownFailed: false, relatedFailed: ['Questions (RFIs)'] }), 'partial')
})

test('items always render, even when some sources failed', () => {
  assert.equal(attentionState({ itemCount: 2, ownFailed: true, relatedFailed: ['Notifications'] }), 'items')
})

test('listSources names failed sources without duplicates', () => {
  assert.equal(listSources([]), '')
  assert.equal(listSources(['Questions (RFIs)']), 'Questions (RFIs)')
  assert.equal(listSources(['Questions (RFIs)', 'Client updates', 'Questions (RFIs)']), 'Questions (RFIs) and Client updates')
  assert.equal(listSources(['A', 'B', 'C']), 'A, B and C')
})
