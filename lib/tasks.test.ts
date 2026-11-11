import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatTaskDue, parseTaskInput, sortOpenTasks, taskUrgency } from './tasks.ts'

const today = '2026-11-11'
const t = (id: string, dueDate: string | null, createdAt = '2026-11-01T00:00:00Z') => ({ id, dueDate, createdAt })

test('orders overdue, today, future, then undated', () => {
  const sorted = sortOpenTasks(
    [t('none', null), t('future', '2026-11-20'), t('today', today), t('late', '2026-11-02'), t('soon', '2026-11-12')],
    today,
  )
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['late', 'today', 'soon', 'future', 'none'],
  )
})

test('ties fall back to the oldest task', () => {
  const sorted = sortOpenTasks([t('b', null, '2026-11-05T00:00:00Z'), t('a', null, '2026-11-01T00:00:00Z')], today)
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['a', 'b'],
  )
})

test('urgency and due labels', () => {
  assert.equal(taskUrgency(null, today), 'undated')
  assert.equal(formatTaskDue(today, today), 'Today')
  assert.equal(formatTaskDue('2026-11-03', today), 'Overdue · Nov 3')
  assert.equal(formatTaskDue('2027-01-04', today), 'Jan 4, 2027')
})

test('validates task input', () => {
  assert.deepEqual(parseTaskInput({ title: '  Call   supplier ' }), {
    input: { title: 'Call supplier', projectId: null, dueDate: null },
  })
  assert.ok('error' in parseTaskInput({ title: '   ' }))
  assert.ok('error' in parseTaskInput({ title: 'x', dueDate: '2026-02-30' }))
  assert.ok('error' in parseTaskInput({ title: 'x', projectId: 'not-a-uuid' }))
  assert.ok('error' in parseTaskInput({ title: 'x'.repeat(201) }))
})
