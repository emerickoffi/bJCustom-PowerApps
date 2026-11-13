import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WORK_SCOPE,
  WORK_SCOPE_OPTIONS,
  actionListClear,
  briefingClear,
  briefingMatches,
  resolveWorkScope,
  workScopeEmptyMessage,
} from './work-scope.ts'

describe('work scope selector order', () => {
  it('lists My work first, then All work, without swapping values', () => {
    assert.deepEqual(
      WORK_SCOPE_OPTIONS.map((o) => o.label),
      ['My work', 'All work'],
    )
    assert.deepEqual(
      WORK_SCOPE_OPTIONS.map((o) => o.value),
      ['mine', 'all'],
    )
  })
})

describe('resolveWorkScope', () => {
  it('defaults to My work when nothing is saved', () => {
    assert.equal(DEFAULT_WORK_SCOPE, 'mine')
    assert.equal(resolveWorkScope(null), 'mine')
    assert.equal(resolveWorkScope(undefined), 'mine')
  })
  it('preserves a saved preference', () => {
    assert.equal(resolveWorkScope('all'), 'all')
    assert.equal(resolveWorkScope('mine'), 'mine')
  })
  it('ignores unrecognized values', () => {
    assert.equal(resolveWorkScope('everyone'), 'mine')
    assert.equal(resolveWorkScope(''), 'mine')
  })
})

describe('empty state copy', () => {
  it('names the scope', () => {
    assert.equal(workScopeEmptyMessage('mine'), 'You’re all caught up.')
    assert.equal(workScopeEmptyMessage('all'), 'No pending actions in this view.')
  })
})

describe('combined empty state conditions', () => {
  it('treats a fully checked, empty list as clear', () => {
    assert.equal(actionListClear({ itemCount: 0, unavailableCount: 0 }), true)
  })
  it('does not treat a list with records or unchecked modules as clear', () => {
    assert.equal(actionListClear({ itemCount: 2, unavailableCount: 0 }), false)
    assert.equal(actionListClear({ itemCount: 0, unavailableCount: 1 }), false)
  })
  it('treats an empty, fully checked briefing as clear', () => {
    assert.equal(briefingClear({ itemCount: 0, uncheckedCount: 0 }), true)
  })
  it('does not treat priorities with records, partial data, or a failed refresh as clear', () => {
    assert.equal(briefingClear({ itemCount: 1, uncheckedCount: 0 }), false)
    assert.equal(briefingClear({ itemCount: 0, uncheckedCount: 1 }), false)
    assert.equal(briefingClear({ itemCount: 0, uncheckedCount: 0, failed: true }), false)
  })
})

describe('briefingMatches (stale scope guard)', () => {
  const expected = { scope: 'mine' as const, projectId: null }
  it('accepts a briefing for the current scope and project', () => {
    assert.equal(briefingMatches({ scope: 'mine', projectId: null }, expected), true)
  })
  it('rejects a late response from the previous scope', () => {
    assert.equal(briefingMatches({ scope: 'all', projectId: null }, expected), false)
  })
  it('rejects a briefing for another project', () => {
    assert.equal(briefingMatches({ scope: 'mine', projectId: 'p1' }, expected), false)
    assert.equal(briefingMatches({ scope: 'mine', projectId: null }, { scope: 'mine', projectId: 'p1' }), false)
  })
  it('rejects missing data', () => {
    assert.equal(briefingMatches(undefined, expected), false)
  })
})
