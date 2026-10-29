import { test } from 'node:test'
import assert from 'node:assert/strict'
import { companyInitials, projectCountLabel, summarizeDirectory } from './subcontractor-directory.ts'

test('companyInitials uses the first two words', () => {
  assert.equal(companyInitials('Hill Country Electric LLC'), 'HC')
  assert.equal(companyInitials('A&B Plumbing'), 'AB')
  assert.equal(companyInitials('Framers'), 'FR')
  assert.equal(companyInitials('  '), '?')
})

test('summarizeDirectory counts active and project-associated companies', () => {
  const companies = [
    { id: 'a', status: 'active' },
    { id: 'b', status: 'inactive' },
    { id: 'c', status: 'active' },
  ]
  const byCompany = { a: [1], b: [1, 2], c: [], ghost: [1] }
  assert.deepEqual(summarizeDirectory(companies, byCompany), { total: 3, active: 2, onProjects: 2 })
})

test('summarizeDirectory reports unknown association when storage is unavailable', () => {
  assert.equal(summarizeDirectory([{ id: 'a', status: 'active' }], null).onProjects, null)
})

test('projectCountLabel pluralizes and handles zero', () => {
  assert.equal(projectCountLabel(0), 'No projects')
  assert.equal(projectCountLabel(1), '1 project')
  assert.equal(projectCountLabel(4), '4 projects')
})
