import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildAttentionItems, informationalNotifications, type AttentionNotification } from './attention.ts'

const ALL = { schedule: true, warranty: true, documents: true, e_signatures: true }
const TODAY = '2026-10-28'

function note(partial: Partial<AttentionNotification>): AttentionNotification {
  return {
    id: 'x',
    title: 't',
    body: null,
    link: null,
    kind: 'general',
    action_required: false,
    dedupe_key: null,
    created_at: '2026-10-27T10:00:00Z',
    project_id: 'p1',
    projectName: 'Lake House',
    ...partial,
  }
}

test('signed estimates are updates, declined signatures and flagged items are pending', () => {
  const rows = [
    note({ id: 'signed', kind: 'signature_request', dedupe_key: 'signature:r1:completed' }),
    note({ id: 'declined', kind: 'signature_request', dedupe_key: 'signature:r2:declined' }),
    note({ id: 'claim', kind: 'warranty_claim', action_required: true }),
    note({ id: 'comment', kind: 'general' }),
  ]
  const items = buildAttentionItems(rows, [], ALL, TODAY)
  assert.deepEqual(items.map((i) => i.key).sort(), ['n-claim', 'n-declined'])
  assert.deepEqual(informationalNotifications(rows, ALL).map((n) => n.id), ['signed', 'comment'])
})

test('delayed schedule work is critical, sorted first, and links to the project schedule', () => {
  const items = buildAttentionItems(
    [note({ id: 'claim', kind: 'warranty_claim', action_required: true, link: '/projects/p1/warranty' })],
    [{ id: 'a1', project_id: 'p2', name: 'Framing', status: 'in_progress', planned_end: '2026-10-20', projectName: 'Ridge' }],
    ALL,
    TODAY,
  )
  assert.equal(items[0].priority, 'critical')
  assert.equal(items[0].href, '/projects/p2/schedule')
  assert.equal(items[1].href, '/projects/p1/warranty')
})

test('disabled features drop their items', () => {
  const items = buildAttentionItems(
    [note({ id: 'claim', kind: 'warranty_claim', action_required: true })],
    [{ id: 'a1', project_id: 'p2', name: 'Framing', status: 'delayed', planned_end: null, projectName: null }],
    { ...ALL, schedule: false, warranty: false },
    TODAY,
  )
  assert.equal(items.length, 0)
})

const DELAY = {
  id: 'l1',
  project_id: 'p1',
  projectName: 'Lake House',
  log_date: '2026-10-27',
  delay_reason: 'Weather',
  delay_description: 'Rain stopped roofing at noon',
}

test('reported Daily Log delays sit between schedule and task items, quoted as field notes', () => {
  const items = buildAttentionItems(
    [note({ id: 'claim', kind: 'warranty_claim', action_required: true })],
    [{ id: 'a1', project_id: 'p2', name: 'Framing', status: 'delayed', planned_end: null, projectName: 'Ridge' }],
    { ...ALL, daily_logs: true },
    TODAY,
    [DELAY],
  )
  assert.deepEqual(items.map((i) => i.priority), ['critical', 'reported', 'pending'])
  const log = items[1]
  assert.equal(log.issueType, 'Daily Log')
  assert.equal(log.sourceDate, '2026-10-27')
  assert.equal(log.href, '/projects/p1/daily-logs/l1')
  assert.equal(log.description, 'Field note: “Weather”')
})

test('Daily Log delays are hidden when Daily Logs is disabled', () => {
  const items = buildAttentionItems([], [], ALL, TODAY, [DELAY])
  assert.equal(items.length, 0)
})

test('assigned companies appear on overdue work only when Subcontractors is enabled', () => {
  const activity = {
    id: 'a1',
    project_id: 'p2',
    name: 'Electrical rough-in',
    status: 'in_progress',
    planned_end: '2026-10-20',
    projectName: 'Ridge',
    companies: ['Volt Electric'],
  }
  const on = buildAttentionItems([], [activity], { ...ALL, subcontractors: true }, TODAY)
  assert.equal(on[0].issueType, 'Assigned work')
  assert.match(on[0].description, /Assigned to Volt Electric\.$/)
  assert.equal(on[0].sourceDate, '2026-10-20')

  const off = buildAttentionItems([], [activity], ALL, TODAY)
  assert.equal(off[0].issueType, 'Schedule')
  assert.doesNotMatch(off[0].description, /Volt Electric/)
})
