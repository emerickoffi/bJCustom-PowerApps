import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dashboardKeyForRole,
  defaultLayout,
  moveWidget,
  normalizeLayoutForSave,
  parseLayoutEntries,
  resolveLayout,
} from './dashboard-layout.ts'
import { buildUpcomingWork, isOverdueItem } from './field-dashboard.ts'

const all = { schedule: true, warranty: true, daily_logs: true }

test('role maps to dashboard key; non-staff get none', () => {
  assert.equal(dashboardKeyForRole('org_admin'), 'owner')
  assert.equal(dashboardKeyForRole('project_manager'), 'project_manager')
  assert.equal(dashboardKeyForRole('builder_staff'), 'builder_staff')
  assert.equal(dashboardKeyForRole(null), null)
})

test('project health is offered to project managers but not builder staff', () => {
  assert.ok(defaultLayout('project_manager', all).some((e) => e.id === 'project_health'))
  assert.ok(!defaultLayout('builder_staff', all).some((e) => e.id === 'project_health'))
})

test('widgets for disabled modules are removed', () => {
  const ids = resolveLayout('builder_staff', null, { schedule: false, daily_logs: false }).map((w) => w.id)
  assert.ok(!ids.includes('upcoming_work'))
  assert.ok(!ids.includes('job_updates'))
})

test('saved layout keeps order, drops unknown and unpermitted ids, appends new ones', () => {
  const saved = parseLayoutEntries({
    widgets: [
      { id: 'assigned_jobs', visible: true },
      { id: 'project_health', visible: true },
      { id: 'kpis', visible: true },
      { id: 'made_up', visible: true },
      { id: 'focus', visible: false },
    ],
  })
  const ids = resolveLayout('builder_staff', saved, all).map((w) => w.id)
  assert.equal(ids[0], 'current_job')
  assert.ok(ids.indexOf('assigned_jobs') < ids.indexOf('focus'))
  assert.ok(!ids.includes('project_health'))
  assert.ok(!ids.includes('kpis'))
  assert.ok(ids.includes('job_actions'))
})

test('locked Action Center widget cannot be hidden', () => {
  const resolved = resolveLayout('project_manager', [{ id: 'job_actions', visible: false }], all)
  assert.equal(resolved.find((w) => w.id === 'job_actions')?.visible, true)
  const saved = normalizeLayoutForSave('project_manager', [{ id: 'job_actions', visible: false }], all)
  assert.equal(saved.widgets.find((w) => w.id === 'job_actions')?.visible, true)
  assert.ok(!saved.widgets.some((w) => w.id === 'current_job'))
})

test('malformed input parses to an empty list', () => {
  assert.deepEqual(parseLayoutEntries('nope'), [])
  assert.deepEqual(parseLayoutEntries([{ id: 1, visible: 'yes' }]), [])
})

test('moveWidget stays within region and stops at edges', () => {
  const list = resolveLayout('builder_staff', null, all)
  const firstMain = list.find((w) => w.region === 'main')!
  assert.equal(moveWidget(list, firstMain.id, -1), list)
  const moved = moveWidget(list, firstMain.id, 1)
  assert.notEqual(moved, list)
  assert.equal(moved[0].id, 'current_job')
})

test('upcoming work uses only real dates and sorts by date', () => {
  const items = buildUpcomingWork({
    projectId: 'p1',
    today: '2026-10-31',
    limit: 10,
    activities: [
      { id: 'a1', name: 'Framing', status: 'in_progress', planned_start: '2026-10-20', planned_end: '2026-10-28' },
      { id: 'a2', name: 'Drywall', status: 'not_started', planned_start: '2026-11-05', planned_end: '2026-11-12' },
      { id: 'a3', name: 'Undated', status: 'not_started', planned_start: null, planned_end: null },
      { id: 'a4', name: 'Done', status: 'completed', planned_start: '2026-11-01', planned_end: '2026-11-02' },
    ],
    issues: [
      { id: 'i1', item_label: 'Fix trim', category: null, due_date: '2026-11-01', status: 'open' },
      { id: 'i2', item_label: 'No date', category: null, due_date: null, status: 'open' },
      { id: 'i3', item_label: 'Closed', category: null, due_date: '2026-11-01', status: 'closed' },
    ],
  })
  assert.deepEqual(items.map((i) => i.title), ['Framing', 'Fix trim', 'Drywall'])
  assert.equal(items[0].overdue, true)
  assert.equal(items[0].dateLabel, 'Finishes')
  assert.equal(items[2].dateLabel, 'Starts')
  assert.equal(items[1].href, '/projects/p1/issues/i1')
})

test('isOverdueItem compares due date to today', () => {
  assert.equal(isOverdueItem({ dueDate: '2026-10-30' }, '2026-10-31'), true)
  assert.equal(isOverdueItem({ dueDate: null }, '2026-10-31'), false)
})
