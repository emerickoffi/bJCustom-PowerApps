import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navForRole } from './navigation.ts'
import type { FeatureMap } from './feature-registry.ts'

const allOn = new Proxy({}, { get: () => true }) as FeatureMap
const labels = (role: Parameters<typeof navForRole>[0], features: FeatureMap = allOn) => navForRole(role, features).map((i) => i.label)

test('Builder Staff get a field-only menu', () => {
  assert.deepEqual(labels('builder_staff'), ['Dashboard', 'Projects', 'Schedule', 'Daily Logs', 'Time'])
})

test('one Reports item replaces the separate report links', () => {
  const admin = labels('org_admin')
  assert.ok(admin.includes('Reports'))
  for (const old of ['Job Costing', 'Schedule Report', 'Warranty Report', 'Data Exports']) assert.ok(!admin.includes(old), old)
})

test('Reports shows only when a report the role can open is on', () => {
  const only = (key: string) => new Proxy({}, { get: (_t, k) => k === key || !String(k).includes('report') && k !== 'data_exports' }) as FeatureMap
  assert.ok(!labels('org_admin', only('none')).includes('Reports'))
  assert.ok(labels('org_admin', only('data_exports')).includes('Reports'))
  assert.ok(!labels('project_manager', only('data_exports')).includes('Reports'), 'exports are admin-only')
  assert.ok(labels('project_manager', only('schedule_reports')).includes('Reports'))
  assert.ok(!labels('builder_staff', only('schedule_reports')).includes('Reports'))
})
