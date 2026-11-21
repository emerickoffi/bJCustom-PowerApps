import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changeOrderLine, groupTime, minutesToHours, sourcesLabel, timeLine } from './invoice-sources.ts'

test('minutes to hours', () => {
  assert.equal(minutesToHours(450), '7.5')
  assert.equal(minutesToHours(735), '12.25')
  assert.equal(minutesToHours(20), '0.333')
  assert.equal(minutesToHours(60), '1')
})

test('change order line bills the price once, not taxed', () => {
  const l = changeOrderLine({ id: 'c1', co_number: 'CO-003', title: 'Upgrade tile', price_cents: 1_250_50, selection_name: 'Primary bath tile', billed_on: null })
  assert.equal(l.description, 'CO-003: Upgrade tile (selection: Primary bath tile)')
  assert.equal(l.unitRate, '1250.50')
  assert.equal(l.quantity, '1')
  assert.deepEqual(l.sources, [{ type: 'change_order', id: 'c1' }])
  assert.equal(l.sourceLabel, 'From CO-003')
})

test('time groups per person, skips billed entries, averages cost rate', () => {
  const groups = groupTime(
    [
      { id: 't1', user_id: 'u1', worked_minutes: 240, hourly_cost_cents: 4000, started_at: '2026-11-03T13:00:00Z', billed_on: null },
      { id: 't2', user_id: 'u1', worked_minutes: 120, hourly_cost_cents: 5500, started_at: '2026-11-05T13:00:00Z', billed_on: null },
      { id: 't3', user_id: 'u2', worked_minutes: 60, hourly_cost_cents: 3000, started_at: '2026-11-04T13:00:00Z', billed_on: 'INV-0004' },
      { id: 't4', user_id: 'u3', worked_minutes: 30, hourly_cost_cents: null, started_at: '2026-11-02T13:00:00Z', billed_on: null },
    ],
    new Map([['u1', 'Maria Lopez']]),
  )
  assert.deepEqual(groups.map((g) => [g.name, g.minutes, g.entryIds.length, g.costRateCents]), [
    ['Team member', 30, 1, 0],
    ['Maria Lopez', 360, 2, 4500],
  ])
  const line = timeLine(groups[1], null)
  assert.equal(line.description, 'Labor: Maria Lopez (Nov 3–Nov 5)')
  assert.equal(line.quantity, '6')
  assert.equal(line.unitRate, '45.00')
  assert.equal(line.sources?.length, 2)
  assert.equal(timeLine(groups[1], 85_00).unitRate, '85.00')
  assert.equal(line.sourceLabel, 'From 2 approved time entries')
})

test('label for saved sources', () => {
  assert.equal(
    sourcesLabel([{ type: 'change_order', id: 'c1' }, { type: 'time_entry', id: 't1' }], new Map([['c1', 'CO-003']])),
    'From CO-003, 1 approved time entry',
  )
  assert.equal(sourcesLabel([], new Map()), undefined)
})
