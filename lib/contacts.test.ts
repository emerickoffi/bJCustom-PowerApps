import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyMapping,
  buildRows,
  categoryCounts,
  defaultSort,
  sortForView,
  SORT_OPTIONS,
  companySummary,
  csvCell,
  deriveCompanyCategories,
  derivePersonCategories,
  filterRows,
  guessMapping,
  paginate,
  parseCategory,
  parseCsv,
  parseProductCategories,
  parseView,
  projectCountLabel,
  sortRows,
  toCsv,
  uniqueProjects,
  validateImportRows,
  validateInlineField,
  type CompanyView,
  type PersonView,
} from './contacts.ts'

function person(over: Partial<PersonView> = {}): PersonView {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    email: 'jordan@example.com',
    primary_phone: '(555) 201-3344',
    secondary_phone: null,
    specialty: 'Architect',
    status: 'active',
    updated_at: '2026-10-30T00:00:00Z',
    companies: [],
    categories: ['professionals'],
    projects: [],
    ...over,
  }
}

function company(over: Partial<CompanyView> = {}): CompanyView {
  return {
    id: 'c1',
    company_name: 'ABC Lumber',
    company_email: null,
    company_phone: null,
    status: 'active',
    subcontractor_company_id: null,
    categories: ['suppliers'],
    product_categories: ['Lumber'],
    primary_contact: null,
    contact_count: 0,
    projects: [],
    ...over,
  }
}

test('parseView and parseCategory fall back safely', () => {
  assert.equal(parseView('people'), 'people')
  assert.equal(parseView('bogus'), 'people')
  assert.equal(parseView('all'), 'people')
  assert.equal(parseView(undefined), 'people')
  assert.equal(parseView('companies'), 'companies')
  assert.equal(parseCategory('suppliers'), 'suppliers')
  assert.equal(parseCategory('drop table'), null)
})

test('companySummary and projectCountLabel', () => {
  assert.equal(companySummary([]), '—')
  assert.equal(companySummary(['ABC Lumber']), 'ABC Lumber')
  assert.equal(companySummary(['ABC Lumber', 'B', 'C']), 'ABC Lumber +2')
  assert.equal(projectCountLabel(0), 'Not assigned')
  assert.equal(projectCountLabel(1), '1 project')
  assert.equal(projectCountLabel(3), '3 projects')
})

test('category derivation', () => {
  assert.deepEqual(derivePersonCategories([], 'Engineer'), ['professionals'])
  assert.deepEqual(derivePersonCategories([], null), ['other'])
  assert.deepEqual(derivePersonCategories([['suppliers'], ['subcontractors', 'suppliers']], null), ['suppliers', 'subcontractors'])
  assert.deepEqual(deriveCompanyCategories([], true), ['subcontractors'])
  assert.deepEqual(deriveCompanyCategories([], false), ['other'])
})

test('uniqueProjects removes duplicates', () => {
  const out = uniqueProjects([
    { project_id: 'b', name: 'B', project_number: 'P2' },
    { project_id: 'a', name: 'A', project_number: 'P1' },
    { project_id: 'b', name: 'B', project_number: 'P2' },
  ])
  assert.deepEqual(out.map((p) => p.project_id), ['a', 'b'])
})

test('inline validation trims, lowercases email, rejects blanks for names', () => {
  assert.deepEqual(validateInlineField('email', ' A@B.CO '), { ok: true, value: 'a@b.co' })
  assert.deepEqual(validateInlineField('specialty', '  '), { ok: true, value: null })
  assert.equal(validateInlineField('first_name', '').ok, false)
  assert.equal(validateInlineField('email', 'nope').ok, false)
  assert.equal(validateInlineField('primary_phone', 'call me').ok, false)
})

test('parseProductCategories dedupes and caps', () => {
  assert.deepEqual(parseProductCategories('Lumber, lumber , Windows,,'), ['Lumber', 'Windows'])
  assert.equal(parseProductCategories(Array.from({ length: 30 }, (_, i) => `c${i}`).join(',')).length, 20)
})

test('each view holds only its own record type, each person once', () => {
  const p = person({ companies: [
    { relationship_id: 'r1', company_id: 'c1', company_name: 'ABC Lumber', role: null, is_primary_contact: true },
    { relationship_id: 'r2', company_id: 'c2', company_name: 'Other Co', role: null, is_primary_contact: false },
  ] })
  const companies = [company(), company({ id: 'c2', company_name: 'Other Co' })]
  const people = buildRows('people', [p], companies)
  assert.equal(people.length, 1)
  assert.ok(people.every((r) => r.kind === 'person'))
  const comps = buildRows('companies', [p], companies)
  assert.equal(comps.length, 2)
  assert.ok(comps.every((r) => r.kind === 'company'))
})

test('category counts are scoped to the view and count multi-category records in each', () => {
  const rows = buildRows('people', [
    person({ categories: ['suppliers', 'subcontractors'] }),
    person({ id: 'p2', categories: ['other'] }),
  ], [company()])
  const counts = categoryCounts(rows)
  assert.equal(counts.total, 2)
  assert.equal(counts.byCat.suppliers, 1)
  assert.equal(counts.byCat.subcontractors, 1)
  assert.equal(counts.byCat.other, 1)
})

test('sort options are view-specific and switching views resets invalid sorts', () => {
  assert.deepEqual(defaultSort('people'), { key: 'last_name', dir: 'asc' })
  assert.deepEqual(defaultSort('companies'), { key: 'name', dir: 'asc' })
  assert.ok(!SORT_OPTIONS.companies.some((o) => o.value.startsWith('first_name') || o.value.startsWith('last_name')))
  assert.deepEqual(sortForView('companies', { key: 'first_name', dir: 'desc' }), { key: 'name', dir: 'asc' })
  assert.deepEqual(sortForView('companies', { key: 'recent', dir: 'desc' }), { key: 'recent', dir: 'desc' })
  assert.deepEqual(sortForView('people', { key: 'projects', dir: 'desc' }), { key: 'projects', dir: 'desc' })
})

test('recently added sorts newest first', () => {
  const rows = buildRows('people', [
    person({ id: 'old', created_at: '2024-01-01T00:00:00Z' }),
    person({ id: 'new', created_at: '2026-01-01T00:00:00Z' }),
  ], [])
  assert.deepEqual(sortRows(rows, 'recent', 'desc').map((r) => r.id), ['new', 'old'])
})

test('search matches names, companies, and phone digits; filters status and category', () => {
  const rows = buildRows('people', [
    person({ companies: [{ relationship_id: 'r', company_id: 'c1', company_name: 'ABC Lumber', role: 'Sales', is_primary_contact: false }] }),
    person({ id: 'p2', first_name: 'Sam', last_name: 'Ortiz', email: null, primary_phone: null, status: 'inactive', categories: ['other'] }),
  ], [company()])
  assert.deepEqual(filterRows(rows, { query: 'abc', status: 'all', category: null }).map((r) => r.id), ['p1'])
  assert.deepEqual(filterRows(rows, { query: '2013344', status: 'all', category: null }).map((r) => r.id), ['p1'])
  assert.deepEqual(filterRows(rows, { query: '', status: 'inactive', category: null }).map((r) => r.id), ['p2'])
  const companyRows = buildRows('companies', [], [company()])
  assert.deepEqual(filterRows(companyRows, { query: '', status: 'all', category: 'suppliers' }).map((r) => r.id), ['c1'])
})

test('sortRows sorts by projects and name', () => {
  const rows = buildRows('people', [
    person({ id: 'a', last_name: 'Zed', projects: [{ project_id: 'x', name: 'X', project_number: '1' }] }),
    person({ id: 'b', last_name: 'Abe' }),
  ], [])
  assert.deepEqual(sortRows(rows, 'name', 'asc').map((r) => r.id), ['b', 'a'])
  assert.deepEqual(sortRows(rows, 'projects', 'desc').map((r) => r.id), ['a', 'b'])
})

test('paginate clamps the page', () => {
  const r = paginate([1, 2, 3, 4, 5], 9, 2)
  assert.equal(r.page, 3)
  assert.deepEqual(r.items, [5])
})

test('csvCell neutralizes formulas and quotes', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assert.equal(csvCell('+15552013344'), "'+15552013344")
  assert.equal(csvCell('@SUM'), "'@SUM")
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell(null), '')
  assert.equal(toCsv(['A'], [['x']]), 'A\r\nx\r\n')
})

test('parseCsv handles BOM, quotes, embedded newlines, and blank lines', () => {
  const rows = parseCsv('\uFEFFFirst Name,Notes\r\n"Jo","line1\nline2, ""q"""\r\n\r\nSam,\n')
  assert.deepEqual(rows, [['First Name', 'Notes'], ['Jo', 'line1\nline2, "q"'], ['Sam', '']])
})

test('guessMapping matches labels and aliases', () => {
  const m = guessMapping(['First Name', 'surname', 'E-mail', 'Mobile', 'Company Name'])
  assert.deepEqual(m, { first_name: 0, last_name: 1, email: 2, primary_phone: 3, company_name: 4 })
})

test('validateImportRows reports errors and duplicates', () => {
  const mapped = applyMapping(
    [
      ['Jo', 'Lee', 'jo@x.com', ''],
      ['', 'Ray', 'bad', ''],
      ['Jo', 'Lee', 'JO@x.com', ''],
      ['Al', 'Kim', 'al@x.com', 'Owner'],
    ],
    { first_name: 0, last_name: 1, email: 2, role: 3 },
  )
  const out = validateImportRows(mapped, new Set(['al@x.com']))
  assert.equal(out[0].errors.length, 0)
  assert.equal(out[0].line, 2)
  assert.ok(out[1].errors.some((e) => e.startsWith('First Name')))
  assert.ok(out[1].errors.some((e) => e.startsWith('Email')))
  assert.equal(out[2].duplicate, 'file')
  assert.equal(out[3].duplicate, 'existing')
  assert.ok(out[3].errors.some((e) => e.includes('requires a company')))
})

import { parseProjectAssignments as parseAssignments, MAX_FORM_PROJECT_ASSIGNMENTS as MAX_ASSIGN } from './contacts.ts'

const PID_A = '11111111-1111-4111-8111-111111111111'
const PID_B = '22222222-2222-4222-8222-222222222222'

test('parseProjectAssignments: blank input means no assignments', () => {
  assert.deepEqual(parseAssignments(''), { ok: true, value: [] })
  assert.deepEqual(parseAssignments(undefined), { ok: true, value: [] })
})

test('parseProjectAssignments: accepts valid rows and trims roles', () => {
  const r = parseAssignments(JSON.stringify([{ project_id: PID_A, project_role: '  Inspector ' }, { project_id: PID_B, project_role: 'Engineer' }]))
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.value.map((v) => v.project_role), ['Inspector', 'Engineer'])
})

test('parseProjectAssignments: rejects duplicates, bad ids, missing roles, bad JSON, too many', () => {
  assert.equal(parseAssignments(JSON.stringify([{ project_id: PID_A, project_role: 'X' }, { project_id: PID_A, project_role: 'Y' }])).ok, false)
  assert.equal(parseAssignments(JSON.stringify([{ project_id: 'nope', project_role: 'X' }])).ok, false)
  assert.equal(parseAssignments(JSON.stringify([{ project_id: PID_A, project_role: '  ' }])).ok, false)
  assert.equal(parseAssignments('{oops').ok, false)
  assert.equal(parseAssignments('{}').ok, false)
  const many = Array.from({ length: MAX_ASSIGN + 1 }, (_, i) => ({ project_id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`, project_role: 'X' }))
  assert.equal(parseAssignments(JSON.stringify(many)).ok, false)
})
