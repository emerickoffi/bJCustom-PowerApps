import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeProjectHealth, daysBetween, needsScheduleSetup, type ProjectHealthSignals } from './project-health.ts'
import { buildAgenda, type AgendaActivity } from './agenda.ts'

const base: ProjectHealthSignals = {
  scheduleEnabled: true,
  activityCount: 20,
  datedActivityCount: 20,
  delayedCount: 0,
  overdueCount: 0,
  maxDaysOverdue: 0,
  openIssueCount: 0,
  pendingActionCount: 0,
  reportedDelayCount: 0,
}

test('on track only with a schedule and no signals', () => {
  assert.equal(computeProjectHealth(base).level, 'on_track')
})

test('missing schedule is insufficient data, never on track', () => {
  assert.equal(computeProjectHealth({ ...base, activityCount: 0 }).level, 'insufficient_data')
  assert.equal(computeProjectHealth({ ...base, scheduleEnabled: false }).level, 'insufficient_data')
})

test('activities without any planned dates are insufficient data, never on track', () => {
  const h = computeProjectHealth({ ...base, datedActivityCount: 0 })
  assert.equal(h.level, 'insufficient_data')
  assert.match(h.reasons[0], /no planned dates/)
})

test('a delayed activity is at risk', () => {
  const h = computeProjectHealth({ ...base, delayedCount: 1 })
  assert.equal(h.level, 'at_risk')
  assert.match(h.reasons[0], /1 activity marked delayed/)
})

test('one recent overdue activity needs attention; many or old escalates', () => {
  assert.equal(computeProjectHealth({ ...base, overdueCount: 1, maxDaysOverdue: 3 }).level, 'needs_attention')
  assert.equal(computeProjectHealth({ ...base, overdueCount: 3, maxDaysOverdue: 3 }).level, 'at_risk')
  assert.equal(computeProjectHealth({ ...base, overdueCount: 1, maxDaysOverdue: 15 }).level, 'at_risk')
})

test('issues and pending actions need attention even without a schedule', () => {
  const h = computeProjectHealth({ ...base, activityCount: 0, openIssueCount: 2, pendingActionCount: 1 })
  assert.equal(h.level, 'needs_attention')
  assert.deepEqual(h.reasons, ['2 open punch list issues', '1 pending action for you'])
})

test('daysBetween counts calendar days', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30)
})

const act = (id: string, planned_start: string | null, planned_end: string | null, status = 'not_started'): AgendaActivity => ({
  id,
  project_id: 'p',
  projectName: 'Home',
  name: id,
  activity_type: 'task',
  status,
  planned_start,
  planned_end,
})

test('agenda groups today and the coming week, skipping done, undated, and out-of-range work', () => {
  const today = '2026-10-30'
  const agenda = buildAgenda(
    [
      act('ongoing', '2026-10-28', '2026-11-02'),
      act('dueToday', '2026-10-29', '2026-10-30'),
      act('startsLater', '2026-11-03', '2026-11-10'),
      act('farOut', '2026-11-20', '2026-11-25'),
      act('past', '2026-10-01', '2026-10-10'),
      act('done', '2026-10-30', '2026-10-30', 'completed'),
      act('undated', null, null),
    ],
    today,
  )
  assert.deepEqual(agenda.today.map((e) => [e.id, e.kind]), [['dueToday', 'due'], ['ongoing', 'ongoing']])
  assert.deepEqual(agenda.week.map((e) => e.id), ['dueToday', 'ongoing', 'ongoing', 'startsLater'])
})

test('needsScheduleSetup only for missing or undated schedules', () => {
  assert.equal(needsScheduleSetup(computeProjectHealth({ ...base, activityCount: 0, datedActivityCount: 0 })), true)
  assert.equal(needsScheduleSetup(computeProjectHealth({ ...base, datedActivityCount: 0 })), true)
  assert.equal(needsScheduleSetup(computeProjectHealth({ ...base, scheduleEnabled: false })), false)
  assert.equal(needsScheduleSetup(computeProjectHealth(base)), false)
  assert.equal(needsScheduleSetup(computeProjectHealth({ ...base, delayedCount: 1, datedActivityCount: 0 })), false)
})
