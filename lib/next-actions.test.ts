import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeownerActions, buildProjectNextActions, latestSignatureRequests, type ProjectActionState } from './next-actions.ts'

const ALL = { schedule: true, estimates: true, documents: true, e_signatures: true, walkthroughs: true }

function state(partial: Partial<ProjectActionState> = {}): ProjectActionState {
  return {
    projectId: 'p1',
    canManage: true,
    features: ALL,
    lateActivityCount: 0,
    reviewEstimateIds: [],
    signatureRequests: [],
    openIssueCount: 0,
    firstOpenIssueId: null,
    ...partial,
  }
}

test('a healthy project has no next actions', () => {
  assert.deepEqual(buildProjectNextActions(state()), { items: [], hiddenCount: 0 })
})

test('actions are prioritized and limited to three', () => {
  const { items, hiddenCount } = buildProjectNextActions(
    state({
      lateActivityCount: 2,
      reviewEstimateIds: ['e1'],
      openIssueCount: 1,
      firstOpenIssueId: 'i1',
      signatureRequests: [{ document_id: 'd1', status: 'awaiting_signatures', created_at: '2026-10-01' }],
    }),
  )
  assert.deepEqual(items.map((a) => a.key), ['late-activities', 'estimate-review', 'open-issues'])
  assert.equal(hiddenCount, 1)
  assert.equal(items[1].href, '/estimates/e1')
})

test('setup tasks are not next actions; they live in the setup checklist', () => {
  const keys = buildProjectNextActions(state({ status: 'preconstruction' })).items.map((a) => a.key)
  assert.ok(!keys.includes('assign-manager'))
  assert.ok(!keys.includes('schedule-setup'))
})

test('undated open work is a planning step, listed after every review', () => {
  const only = buildProjectNextActions(state({ status: 'under_construction', undatedOpenActivityCount: 3 }))
  assert.deepEqual(only.items.map((a) => a.key), ['schedule-dates'])
  assert.equal(only.items[0].title, 'Schedule dates needed')
  assert.equal(only.items[0].tone, 'setup')
  assert.equal(only.items[0].href, '/projects/p1/schedule')
  assert.match(only.items[0].description, /^3 open activities have no planned dates/)

  const busy = buildProjectNextActions(
    state({ undatedOpenActivityCount: 1, lateActivityCount: 1, reviewEstimateIds: ['e1'], openIssueCount: 1, firstOpenIssueId: 'i1' }),
  )
  assert.deepEqual(busy.items.map((a) => a.key), ['late-activities', 'estimate-review', 'open-issues'])
  assert.equal(busy.hiddenCount, 1)
})

test('schedule dates are not asked on closed projects, of non-managers, or with scheduling off', () => {
  const undated = { undatedOpenActivityCount: 2 }
  for (const status of ['completed', 'cancelled']) {
    assert.deepEqual(buildProjectNextActions(state({ ...undated, status })).items, [])
  }
  assert.deepEqual(buildProjectNextActions(state({ ...undated, canManage: false })).items, [])
  assert.deepEqual(buildProjectNextActions(state({ ...undated, features: { ...ALL, schedule: false } })).items, [])
  assert.deepEqual(buildProjectNextActions(state({ ...undated, scope: 'mine', isProjectManager: false })).items, [])
  assert.deepEqual(buildProjectNextActions(state({ undatedOpenActivityCount: 0 })).items, [])
})

test('management-only actions are hidden from staff who cannot manage', () => {
  const { items } = buildProjectNextActions(state({ canManage: false, reviewEstimateIds: ['e1'], openIssueCount: 3 }))
  assert.deepEqual(items.map((a) => a.key), ['open-issues'])
  assert.equal(items[0].href, '/projects/p1/walkthroughs')
})

test('disabled features suppress their actions', () => {
  const { items } = buildProjectNextActions(
    state({
      features: { schedule: false, estimates: false, documents: true, e_signatures: false, walkthroughs: false },
      lateActivityCount: 4,
      reviewEstimateIds: ['e1'],
      openIssueCount: 2,
      signatureRequests: [{ document_id: 'd1', status: 'awaiting_signatures', created_at: '2026-10-01' }],
    }),
  )
  assert.deepEqual(items, [])
})

test('only the newest signature request per document counts', () => {
  const requests = [
    { document_id: 'd1', status: 'declined', created_at: '2026-10-01' },
    { document_id: 'd1', status: 'awaiting_signatures', created_at: '2026-10-05' },
  ]
  assert.equal(latestSignatureRequests(requests).length, 1)
  const { items } = buildProjectNextActions(state({ signatureRequests: requests }))
  assert.deepEqual(items.map((a) => a.key), ['signatures-pending'])
})

test('homeowner actions include only open tasks on their own projects', () => {
  const actions = buildHomeownerActions({
    projects: [{ id: 'p1', name: 'Oak House' }],
    features: { walkthroughs: true, documents: true, e_signatures: true },
    walkthroughs: [
      { id: 'w1', project_id: 'p1', title: 'Final', status: 'in_progress' },
      { id: 'w2', project_id: 'p1', title: 'Orientation', status: 'submitted' },
      { id: 'w3', project_id: 'other', title: 'Hidden', status: 'draft' },
    ],
    repairsAwaitingConfirmation: [{ id: 'i1', project_id: 'p1', walkthrough_id: 'w2', item_label: 'Paint' }],
    signatureTasks: [
      { projectId: 'p1', signerId: 's1', documentName: 'Contract', status: 'awaiting', requestStatus: 'awaiting_signatures', waitingReason: null },
      { projectId: 'p1', signerId: 's2', documentName: 'Done', status: 'signed', requestStatus: 'partially_signed', waitingReason: null },
      { projectId: 'p1', signerId: 's3', documentName: 'Old', status: 'awaiting', requestStatus: 'cancelled', waitingReason: null },
    ],
  })
  assert.deepEqual(actions.map((a) => a.key), ['sig-s1', 'repair-i1', 'walk-w1'])
})

test('homeowner actions respect disabled features', () => {
  const actions = buildHomeownerActions({
    projects: [{ id: 'p1', name: 'Oak House' }],
    features: { walkthroughs: false, documents: true, e_signatures: false },
    walkthroughs: [{ id: 'w1', project_id: 'p1', title: 'Final', status: 'in_progress' }],
    repairsAwaitingConfirmation: [],
    signatureTasks: [{ projectId: 'p1', signerId: 's1', documentName: 'C', status: 'awaiting', requestStatus: 'awaiting_signatures', waitingReason: null }],
  })
  assert.deepEqual(actions, [])
})

test('my work hides project-wide reviews unless the viewer manages the project', () => {
  const shared = {
    scope: 'mine' as const,
    reviewEstimateIds: ['e1'],
    signatureRequests: [{ document_id: 'd1', status: 'declined', created_at: '2026-10-01' }],
    openIssueCount: 1,
    firstOpenIssueId: 'i1',
  }
  const other = buildProjectNextActions(state({ ...shared, isProjectManager: false }))
  assert.deepEqual(other.items.map((a) => a.key), ['open-issues'])
  const pm = buildProjectNextActions(state({ ...shared, isProjectManager: true }))
  assert.deepEqual(pm.items.map((a) => a.key), ['signature-problems', 'estimate-review', 'open-issues'])
})

test('completed jobs point to warranty only when the warranty module is on', () => {
  const on = buildProjectNextActions(state({ status: 'completed', features: { ...ALL, warranty: true } }))
  assert.deepEqual(on.items.map((a) => a.key), ['warranty'])
  assert.equal(on.items[0].href, '/projects/p1/warranty')
  const off = buildProjectNextActions(state({ status: 'completed' }))
  assert.equal(off.items.length, 0)
  const active = buildProjectNextActions(state({ status: 'under_construction', features: { ...ALL, warranty: true } }))
  assert.equal(active.items.length, 0)
})
