import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHomeownerActions, buildProjectNextActions, latestSignatureRequests, type ProjectActionState } from './next-actions.ts'

const ALL = { schedule: true, estimates: true, documents: true, e_signatures: true, walkthroughs: true }

function state(partial: Partial<ProjectActionState> = {}): ProjectActionState {
  return {
    projectId: 'p1',
    canManage: true,
    features: ALL,
    hasProjectManager: true,
    activityCount: 10,
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
      hasProjectManager: false,
      reviewEstimateIds: ['e1'],
      openIssueCount: 1,
      firstOpenIssueId: 'i1',
    }),
  )
  assert.deepEqual(items.map((a) => a.key), ['late-activities', 'assign-manager', 'estimate-review'])
  assert.equal(hiddenCount, 1)
  assert.equal(items[2].href, '/estimates/e1')
})

test('management-only actions are hidden from staff who cannot manage', () => {
  const { items } = buildProjectNextActions(
    state({ canManage: false, hasProjectManager: false, reviewEstimateIds: ['e1'], activityCount: 0, openIssueCount: 3 }),
  )
  assert.deepEqual(items.map((a) => a.key), ['open-issues'])
  assert.equal(items[0].href, '/projects/p1#walkthroughs-heading')
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
