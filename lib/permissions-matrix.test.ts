import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MATRIX_ROLES, PERMISSIONS_MATRIX, ROLE_DETAILS } from './permissions-matrix.ts'

test('every conditional or unverified cell states its specific condition', () => {
  for (const mod of PERMISSIONS_MATRIX) {
    for (const row of mod.actions) {
      for (const role of MATRIX_ROLES) {
        const cell = row.access[role]
        if (cell.state === 'conditional' || cell.state === 'unverified') {
          assert.ok(cell.why && cell.why.length > 20, `${mod.module} / ${row.action} / ${role} needs a specific condition`)
        }
      }
    }
  }
})

test('homeowners never get unconditional access', () => {
  for (const mod of PERMISSIONS_MATRIX) {
    for (const row of mod.actions) {
      assert.notEqual(row.access.client.state, 'allowed', `${mod.module} / ${row.action} must be conditional or denied for homeowners`)
    }
  }
})

test('only administrators can manage company settings and users', () => {
  for (const id of ['company', 'users']) {
    const mod = PERMISSIONS_MATRIX.find((m) => m.id === id)
    assert.ok(mod)
    for (const row of mod.actions) {
      for (const role of MATRIX_ROLES) {
        assert.equal(row.access[role].state, role === 'org_admin' ? 'allowed' : 'denied', `${mod.module} / ${row.action} / ${role}`)
      }
    }
  }
})

test('module ids are unique and every role has details', () => {
  const ids = PERMISSIONS_MATRIX.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const role of MATRIX_ROLES) assert.ok(ROLE_DETAILS[role].summary)
})
