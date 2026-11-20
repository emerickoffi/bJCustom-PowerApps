import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navForRole } from './navigation.ts'

const hrefs = (role: Parameters<typeof navForRole>[0]) => navForRole(role).map((i) => i.href)

test('Invoices is for administrators and project managers only', () => {
  assert.ok(hrefs('org_admin').includes('/invoices'))
  assert.ok(hrefs('project_manager').includes('/invoices'))
  assert.ok(!hrefs('builder_staff').includes('/invoices'))
})
