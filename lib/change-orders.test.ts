import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  allowedTransitions,
  changeOrderPath,
  filterAndSortChangeOrders,
  formatScheduleDays,
  isEditableStatus,
  parseLines,
  progressStates,
  sumLineCosts,
  summarizeChangeOrders,
} from './change-orders.ts'

const row = (over = {}) => ({ category: 'Framing', description: 'Add header', quantity: '2', unit: 'ea', unit_cost: '150.25', ...over })

test('parses lines into exact cents and drops blank rows', () => {
  const { lines, errors } = parseLines([row(), { category: 'Framing', description: '', quantity: '1', unit: '', unit_cost: '' }])
  assert.deepEqual(errors, {})
  assert.equal(lines.length, 1)
  assert.equal(lines[0].cost_cents, 30050)
})

test('credits produce negative cost and sum with additions', () => {
  const { lines } = parseLines([row(), row({ description: 'Remove tile', quantity: '1', unit_cost: '-500' })])
  assert.equal(sumLineCosts(lines), 30050 - 50000)
})

test('reports field errors by row index', () => {
  const { errors } = parseLines([row(), row({ category: 'Nope', quantity: 'x', unit_cost: '1.234' })])
  assert.ok(errors['lines.1.category'])
  assert.ok(errors['lines.1.quantity'])
  assert.ok(errors['lines.1.unit_cost'])
  assert.equal(errors['lines.0.category'], undefined)
})

test('terminal statuses allow no transitions and are not editable', () => {
  for (const s of ['approved', 'rejected', 'void'] as const) {
    assert.deepEqual(allowedTransitions(s), [])
    assert.equal(isEditableStatus(s), false)
  }
  assert.equal(isEditableStatus('awaiting_homeowner'), false)
  assert.ok(allowedTransitions('awaiting_homeowner').includes('approved'))
  assert.ok(!allowedTransitions('draft').includes('approved'))
})

const co = (status: string, price: number, cost: number, days: number | null, extra = {}) =>
  ({ status, price_adjustment_cents: price, cost_adjustment_cents: cost, schedule_impact_days: days, ...extra }) as Parameters<typeof summarizeChangeOrders>[0][number]

test('summary counts approved once and keeps drafts, pending, rejected and void separate', () => {
  const s = summarizeChangeOrders([
    co('approved', 250000, 180000, 5),
    co('approved', -75000, -50000, null),
    co('internal_review', 40000, 30000, 2),
    co('awaiting_homeowner', 10000, 8000, 1),
    co('draft', 999999, 999999, 30),
    co('rejected', 500000, 400000, 10),
    co('void', 500000, 400000, 10),
  ])
  assert.equal(s.approvedCount, 2)
  assert.equal(s.approvedPriceCents, 175000)
  assert.equal(s.approvedCostCents, 130000)
  assert.equal(s.approvedScheduleDays, 5)
  assert.equal(s.approvedWithScheduleCount, 1)
  assert.equal(s.pendingCount, 2)
  assert.equal(s.pendingPriceCents, 50000)
})

test('progression maps canonical statuses without inventing new ones', () => {
  assert.deepEqual(progressStates('draft'), ['current', 'upcoming', 'upcoming', 'upcoming'])
  assert.deepEqual(progressStates('awaiting_homeowner'), ['complete', 'complete', 'current', 'upcoming'])
  assert.deepEqual(progressStates('approved'), ['complete', 'complete', 'complete', 'complete'])
  assert.deepEqual(progressStates('void'), ['upcoming', 'upcoming', 'upcoming', 'upcoming'])
})

test('directory search, status filter and sort', () => {
  const rows = [
    { ...co('draft', 100, 0, null), id: '1', co_number: 'CO-001', number: 1, title: 'Kitchen island', updated_at: '2026-10-01' },
    { ...co('approved', -500, 0, null), id: '2', co_number: 'CO-002', number: 2, title: 'Remove tile', updated_at: '2026-10-03' },
    { ...co('internal_review', 900, 0, null), id: '3', co_number: 'CO-003', number: 3, title: 'Kitchen lighting', updated_at: '2026-10-02' },
  ]
  assert.deepEqual(filterAndSortChangeOrders(rows, 'kitchen', 'all', 'number_asc').map((r) => r.id), ['1', '3'])
  assert.deepEqual(filterAndSortChangeOrders(rows, '', 'open', 'number_desc').map((r) => r.id), ['3', '1'])
  assert.deepEqual(filterAndSortChangeOrders(rows, '', 'all', 'price_asc').map((r) => r.id), ['2', '1', '3'])
  assert.deepEqual(filterAndSortChangeOrders(rows, 'co-002', 'approved', 'updated_desc').map((r) => r.id), ['2'])
})

test('schedule days formatting', () => {
  assert.equal(formatScheduleDays(null), '—')
  assert.equal(formatScheduleDays(3), '+3d')
  assert.equal(formatScheduleDays(-1, 'long'), '-1 day')
})

test('detail path encodes both ids', () => {
  assert.equal(changeOrderPath('a/b', 'c d'), '/projects/a%2Fb/change-orders/c%20d')
})
