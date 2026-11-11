import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pageButtonLauncherIds } from './launcher-actions.ts'

const params = (query = '') => new URLSearchParams(query)

test('header buttons suppress their exact launcher duplicate', () => {
  assert.deepEqual(pageButtonLauncherIds('/projects', params()), ['global:project'])
  assert.deepEqual(pageButtonLauncherIds('/projects', params('preview=abc')), ['global:project'])
  assert.deepEqual(pageButtonLauncherIds('/subcontractors', params()), ['global:subcontractor'])
  assert.deepEqual(pageButtonLauncherIds('/daily-logs', params()), ['ctx:daily_log'])
  assert.deepEqual(pageButtonLauncherIds('/documents', params()), ['ctx:document'])
  assert.deepEqual(pageButtonLauncherIds('/projects/p1/daily-logs', params()), ['ctx:daily_log'])
  assert.deepEqual(pageButtonLauncherIds('/projects/p1/documents', params()), ['ctx:document'])
  assert.deepEqual(pageButtonLauncherIds('/projects/p1/schedule', params()), ['ctx:schedule'])
  assert.deepEqual(pageButtonLauncherIds('/projects/p1/subcontractor-work/quotes', params()), ['quote-request'])
})

test('distinct workflows and pages without a header button keep their shortcuts', () => {
  // Company library uploads are not project uploads.
  assert.deepEqual(pageButtonLauncherIds('/documents', params('tab=company')), [])
  // Assigning stays available beside "Add subcontractor"; only creation is deduplicated.
  assert.ok(!pageButtonLauncherIds('/subcontractors', params()).includes('ctx:assign'))
  // Clients only show creation buttons in their empty state.
  assert.deepEqual(pageButtonLauncherIds('/clients', params()), [])
  // Contacts' header button follows the active tab, so only that tab's creation is deduplicated.
  assert.deepEqual(pageButtonLauncherIds('/contacts', params()), ['global:contact'])
  assert.deepEqual(pageButtonLauncherIds('/contacts', params('view=companies')), ['create-company'])
  assert.deepEqual(pageButtonLauncherIds('/schedule', params()), [])
  // Detail and create sub-pages have no list header button.
  assert.deepEqual(pageButtonLauncherIds('/daily-logs/new', params()), [])
  assert.deepEqual(pageButtonLauncherIds('/projects/new', params()), [])
  assert.deepEqual(pageButtonLauncherIds('/projects/p1', params()), [])
  assert.deepEqual(pageButtonLauncherIds('/projects/p1/subcontractor-work', params()), [])
})
