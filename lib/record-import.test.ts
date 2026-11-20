import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv } from './contacts.ts'
import {
  CLIENT_IMPORT_FIELDS,
  PROJECT_IMPORT_FIELDS,
  RECORD_IMPORT_MAX_ROWS,
  applyImportMapping,
  cleanImportRows,
  clientImportTemplateCsv,
  guessImportMapping,
  matchClient,
  normalizeClientStatus,
  normalizeImportDate,
  normalizeProjectStatus,
  normalizeProjectType,
  projectImportTemplateCsv,
  projectKey,
} from './record-import.ts'

test('templates map back onto every field', () => {
  for (const [fields, csv] of [
    [CLIENT_IMPORT_FIELDS, clientImportTemplateCsv()],
    [PROJECT_IMPORT_FIELDS, projectImportTemplateCsv()],
  ] as const) {
    const [headers, sample] = parseCsv(csv)
    const mapping = guessImportMapping(fields, headers)
    assert.equal(Object.keys(mapping).length, fields.length)
    const [row] = applyImportMapping(fields, [sample], mapping)
    assert.equal(row.line, 2)
  }
})

test('common export headers are recognized', () => {
  const m = guessImportMapping(PROJECT_IMPORT_FIELDS, ['Job Name', 'Customer', 'Job Address', 'Zip', 'Contract Amount', 'PM Email', 'Notes'])
  assert.deepEqual(m, { name: 0, client_name: 1, address_line1: 2, postal_code: 3, estimated_budget: 4, project_manager_email: 5, internal_notes: 6 })
  const c = guessImportMapping(CLIENT_IMPORT_FIELDS, ['first_name', 'Last-Name', 'E-mail', 'Cell Phone', 'Zipcode'])
  assert.deepEqual(c, { first_name: 0, last_name: 1, email: 2, phone: 3, postal_code: 4 })
})

test('dates accept ISO and US formats and reject impossible ones', () => {
  assert.equal(normalizeImportDate(''), '')
  assert.equal(normalizeImportDate('2026-09-01'), '2026-09-01')
  assert.equal(normalizeImportDate('9/1/2026'), '2026-09-01')
  assert.equal(normalizeImportDate('09-01-26'), '2026-09-01')
  assert.equal(normalizeImportDate('2026-09-01T00:00:00Z'), '2026-09-01')
  assert.equal(normalizeImportDate('2/30/2026'), null)
  assert.equal(normalizeImportDate('next week'), null)
})

test('statuses and types accept labels, keys and common words', () => {
  assert.equal(normalizeClientStatus(''), 'active')
  assert.equal(normalizeClientStatus('LEAD'), 'lead')
  assert.equal(normalizeClientStatus('prospect'), null)
  assert.equal(normalizeProjectStatus(''), 'planning')
  assert.equal(normalizeProjectStatus('Under Construction'), 'under_construction')
  assert.equal(normalizeProjectStatus('under_construction'), 'under_construction')
  assert.equal(normalizeProjectStatus('In progress'), 'under_construction')
  assert.equal(normalizeProjectStatus('Completed'), 'completed')
  assert.equal(normalizeProjectStatus('whatever'), null)
  assert.equal(normalizeProjectType(''), 'other')
  assert.equal(normalizeProjectType('New Custom Home'), 'new_custom_home')
  assert.equal(normalizeProjectType('remodel'), 'remodel')
  assert.equal(normalizeProjectType('pool'), null)
})

test('projects link to clients by email, then by name, never by guess', () => {
  const clients = [
    { id: 'a', first_name: 'Jordan', last_name: 'Lee', email: 'jordan@example.com' },
    { id: 'b', first_name: 'Sam', last_name: 'Ortiz', email: null, company_name: 'Ortiz Family Trust' },
    { id: 'c', first_name: 'Sam', last_name: 'Ortiz', email: 'sam2@example.com' },
  ]
  assert.deepEqual(matchClient(clients, 'JORDAN@example.com ', ''), { id: 'a' })
  assert.deepEqual(matchClient(clients, '', 'jordan lee'), { id: 'a' })
  assert.deepEqual(matchClient(clients, '', 'Ortiz Family Trust'), { id: 'b' })
  assert.ok('error' in (matchClient(clients, '', 'Sam Ortiz') ?? {}))
  assert.ok('error' in (matchClient(clients, 'nobody@example.com', '') ?? {}))
  assert.deepEqual(matchClient(clients, 'nobody@example.com', 'Jordan Lee'), { id: 'a' })
  assert.equal(matchClient(clients, '', ''), null)
})

test('duplicate project key ignores case and punctuation', () => {
  assert.equal(projectKey('Lee Residence', '1208 Yaupon Dr.'), projectKey('lee residence', '1208 yaupon dr'))
})

test('server-side cleaning keeps only known fields and caps the row count', () => {
  const rows = cleanImportRows(CLIENT_IMPORT_FIELDS, [{ line: 5, values: { first_name: ' Ana ', evil: 'x', last_name: 7 } }])
  assert.deepEqual(rows?.[0].line, 5)
  assert.equal(rows?.[0].values.first_name, 'Ana')
  assert.equal(rows?.[0].values.last_name, '')
  assert.equal('evil' in (rows?.[0].values ?? {}), false)
  assert.equal(cleanImportRows(CLIENT_IMPORT_FIELDS, 'nope'), null)
  assert.equal(cleanImportRows(CLIENT_IMPORT_FIELDS, Array.from({ length: RECORD_IMPORT_MAX_ROWS + 1 }, () => ({}))), null)
})
