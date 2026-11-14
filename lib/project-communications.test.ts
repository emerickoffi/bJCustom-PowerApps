import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { ActionItem } from './action-items.ts'
import {
  COMM_MAX_LIMIT,
  COMM_PAGE_SIZE,
  applyCommFilters,
  commHref,
  compareActivity,
  compareAttention,
  dedupeById,
  fromActionItem,
  fromClientUpdateDraft,
  fromReceivedQuotes,
  parseCommFilters,
  type CommunicationItem,
} from './project-communications.ts'

const action = (over: Partial<ActionItem>): ActionItem =>
  ({
    id: 'rfi:1',
    projectId: 'p1',
    projectName: 'Job',
    entityType: 'rfi',
    entityId: '1',
    category: 'communication',
    severity: 'normal',
    tier: 'action',
    title: 'Q-1 Footing depth',
    description: 'Waiting on your answer',
    dueDate: null,
    createdAt: '2026-11-01',
    responsibleUserId: 'u1',
    href: '/projects/p1/rfis?rfi=1',
    actionLabel: 'Answer',
    ...over,
  }) as ActionItem

const item = (over: Partial<CommunicationItem>): CommunicationItem => ({
  id: 'x',
  type: 'rfi',
  title: 'T',
  status: 'S',
  date: null,
  dateLabel: null,
  context: null,
  responsibleUserId: null,
  responsibleName: null,
  overdue: false,
  href: '/',
  actionLabel: 'Open',
  ...over,
})

describe('fromActionItem', () => {
  it('maps entity types and keeps the owning workflow link', () => {
    const c = fromActionItem(action({ entityType: 'project_issue' }), '2026-11-13')!
    assert.equal(c.type, 'issue')
    assert.equal(c.href, '/projects/p1/rfis?rfi=1')
  })
  it('flags overdue only for past due dates', () => {
    assert.equal(fromActionItem(action({ dueDate: '2026-11-12' }), '2026-11-13')!.overdue, true)
    assert.equal(fromActionItem(action({ dueDate: '2026-11-13' }), '2026-11-13')!.overdue, false)
    assert.equal(fromActionItem(action({ dueDate: null }), '2026-11-13')!.dateLabel, 'Since')
  })
  it('drops setup and finance prompts that are not communications', () => {
    for (const entityType of ['project', 'subcontractor', 'invoice'] as const) {
      assert.equal(fromActionItem(action({ entityType }), '2026-11-13'), null)
    }
  })
})

describe('derived attention items', () => {
  it('client update drafts route to the update and never claim to be published', () => {
    const c = fromClientUpdateDraft({ id: 'cu 1', projectId: 'p1', title: 'Week 3', updatedAt: '2026-11-10', createdBy: 'u2' })
    assert.equal(c.href, '/projects/p1/client-updates/cu%201')
    assert.match(c.status, /draft/i)
  })
  it('received quotes carry counts only, no amounts', () => {
    const c = fromReceivedQuotes({ requestId: 'r1', projectId: 'p1', title: 'Framing', submittedCount: 3, latestAt: '2026-11-11' })
    assert.equal(c.status, '3 quotes received')
    assert.doesNotMatch(JSON.stringify(c), /\$|amount/i)
  })
})

describe('ordering and dedupe', () => {
  it('attention: overdue, then due dates, then oldest waiting, stable on id', () => {
    const list = [
      item({ id: 'c', date: '2026-11-01', dateLabel: 'Since' }),
      item({ id: 'b', date: '2026-11-20', dateLabel: 'Due' }),
      item({ id: 'a', date: '2026-11-05', dateLabel: 'Due', overdue: true }),
      item({ id: 'd', date: '2026-11-01', dateLabel: 'Since' }),
    ].sort(compareAttention)
    assert.deepEqual(list.map((i) => i.id), ['a', 'b', 'c', 'd'])
  })
  it('activity: newest first', () => {
    const list = [item({ id: 'a', date: '2026-11-01' }), item({ id: 'b', date: '2026-11-09' })].sort(compareActivity)
    assert.deepEqual(list.map((i) => i.id), ['b', 'a'])
  })
  it('dedupe keeps the first occurrence', () => {
    assert.deepEqual(dedupeById([item({ id: 'a', title: '1' }), item({ id: 'a', title: '2' })]).map((i) => i.title), ['1'])
  })
})

describe('filters and URL state', () => {
  it('parses safely and clamps the page size', () => {
    assert.deepEqual(parseCommFilters({}), { view: 'attention', type: null, mine: false, q: '', limit: COMM_PAGE_SIZE })
    const f = parseCommFilters({ cview: 'activity', ctype: 'bogus', cmine: '1', cq: '  roof '.repeat(30), cmore: '9999' })
    assert.equal(f.view, 'activity')
    assert.equal(f.type, null)
    assert.equal(f.limit, COMM_MAX_LIMIT)
    assert.ok(f.q.length <= 80)
  })
  it('preserves unrelated params like the work scope', () => {
    const href = commHref('/projects/p1', { work: 'all', ctype: 'rfi' }, { type: 'issue' })
    assert.equal(href, '/projects/p1?work=all&ctype=issue#communications')
  })
  it('mine applies to Needs Attention only', () => {
    const list = [item({ id: 'a', responsibleUserId: 'u1' }), item({ id: 'b', responsibleUserId: 'u2' })]
    assert.equal(applyCommFilters(list, { ...parseCommFilters({ cmine: '1' }) }, 'u1').length, 1)
    assert.equal(applyCommFilters(list, { ...parseCommFilters({ cmine: '1', cview: 'activity' }) }, 'u1').length, 2)
  })
  it('search matches title, status, and type label', () => {
    const list = [item({ id: 'a', title: 'Roof flashing' }), item({ id: 'b', type: 'quote', title: 'Framing' })]
    assert.deepEqual(applyCommFilters(list, parseCommFilters({ cq: 'ROOF' }), 'u').map((i) => i.id), ['a'])
    assert.deepEqual(applyCommFilters(list, parseCommFilters({ cq: 'quote' }), 'u').map((i) => i.id), ['b'])
  })
})
