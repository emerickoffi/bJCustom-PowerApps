import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractLinks, isAssistantModule, isSafeAppPath, moduleForPath, suggestionsFor } from './assistant-scope.ts'

const ID = '7f3c2a10-0000-4000-8000-000000000001'
const all = { schedule: true, documents: true, signatures: true }
const none = { schedule: false, documents: false, signatures: false }

test('moduleForPath detects project pages and the dashboard', () => {
  assert.equal(moduleForPath(`/projects/${ID}`, ID), 'overview')
  assert.equal(moduleForPath(`/projects/${ID}/`, ID), 'overview')
  assert.equal(moduleForPath(`/projects/${ID}/schedule`, ID), 'schedule')
  assert.equal(moduleForPath(`/projects/${ID}/documents/abc`, ID), 'documents')
  assert.equal(moduleForPath('/dashboard', null), 'dashboard')
  assert.equal(moduleForPath('/settings', null), null)
})

test('moduleForPath ignores paths for a different project', () => {
  assert.equal(moduleForPath('/projects/other/schedule', ID), null)
  assert.equal(moduleForPath(`/projects/${ID}x/schedule`, ID), null)
})

test('suggestions never exceed capabilities', () => {
  assert.ok(suggestionsFor('schedule', true, all).length > 0)
  assert.deepEqual(suggestionsFor('schedule', true, none), ['Analyze project health.'])
  assert.deepEqual(suggestionsFor('documents', true, none), ['Analyze project health.'])
  assert.ok(suggestionsFor('overview', true, all).includes('Analyze project health.'))
  assert.ok(suggestionsFor('dashboard', false, none).some((s) => /market/i.test(s)))
  const docsNoSign = suggestionsFor('documents', true, { ...all, signatures: false })
  assert.ok(docsNoSign.every((s) => !/signature/i.test(s)))
  assert.ok(suggestionsFor('documents', true, all).some((s) => /signature/i.test(s)))
  assert.ok(suggestionsFor('dashboard', false, none).length > 0)
  assert.deepEqual(suggestionsFor(null, false, none), [])
})

test('isAssistantModule rejects unknown values', () => {
  assert.equal(isAssistantModule('schedule'), true)
  assert.equal(isAssistantModule('admin'), false)
  assert.equal(isAssistantModule(42), false)
})

test('extractLinks keeps only allowlisted keys and strips markers', () => {
  const allowed = [
    { key: 'schedule', label: 'Open schedule', href: `/projects/${ID}/schedule` },
    { key: 'documents', label: 'Open documents', href: `/projects/${ID}/documents` },
  ]
  const out = extractLinks('Two items are late [[link:schedule]]. See [[link:evil]] and [[link:SCHEDULE]].', allowed)
  assert.equal(out.text, 'Two items are late. See and.')
  assert.deepEqual(out.links.map((l) => l.key), ['schedule'])
})

test('extractLinks caps the number of links', () => {
  const allowed = ['a', 'b', 'c', 'd'].map((k) => ({ key: k, label: k, href: `/x/${k}` }))
  const out = extractLinks('[[link:a]][[link:b]][[link:c]][[link:d]]', allowed)
  assert.equal(out.links.length, 3)
})

test('isSafeAppPath only allows same-origin paths', () => {
  assert.equal(isSafeAppPath('/projects/1'), true)
  assert.equal(isSafeAppPath('//evil.com'), false)
  assert.equal(isSafeAppPath('https://evil.com'), false)
  assert.equal(isSafeAppPath('/\\evil.com'), false)
  assert.equal(isSafeAppPath('javascript:alert(1)'), false)
})
