import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  businessDaysBetween,
  moveItem,
  projectScheduleToTemplate,
  pruneForwardDependencies,
  publishBlockers,
  readTemplateContent,
  removeActivity,
  removePhase,
  summarizeTemplate,
  validateTemplateContent,
  type TemplateContent,
} from './project-templates.ts'
import { buildJobTimeline } from './job-timeline.ts'

const act = (key: string, duration: number | null, predecessors: string[] = [], type = 'task' as const) => ({
  key,
  name: `Activity ${key}`,
  type,
  duration_days: duration,
  weight: 1,
  predecessors,
})

const sample: TemplateContent = {
  phases: [
    { name: 'Preconstruction', activities: [act('a1', 5), { ...act('a2', 0, ['a1']), type: 'milestone' }] },
    { name: 'Foundation', activities: [act('a3', 4, ['a2']), { ...act('a4', 1, ['a3']), type: 'inspection' }] },
  ],
}

test('valid content passes validation', () => {
  assert.equal(validateTemplateContent(sample).ok, true)
})

test('forward and self dependencies are rejected', () => {
  const bad: TemplateContent = { phases: [{ name: 'P', activities: [act('a1', 1, ['a2']), act('a2', 1, ['a2'])] }] }
  const r = validateTemplateContent(bad)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.ok(r.errors.some((e) => e.includes('missing or comes after')))
    assert.ok(r.errors.some((e) => e.includes('itself')))
  }
})

test('duplicate keys, blank names, and negative durations are rejected', () => {
  assert.equal(validateTemplateContent({ phases: [{ name: 'P', activities: [act('a1', 1), act('a1', 1)] }] }).ok, false)
  assert.equal(validateTemplateContent({ phases: [{ name: ' ', activities: [] }] }).ok, false)
  assert.equal(validateTemplateContent({ phases: [{ name: 'P', activities: [act('a1', -1)] }] }).ok, false)
})

test('publishing requires a phase and an activity', () => {
  assert.deepEqual(publishBlockers({ phases: [] }), ['Add at least one phase'])
  assert.deepEqual(publishBlockers({ phases: [{ name: 'P', activities: [] }] }), ['Add at least one activity'])
  assert.deepEqual(publishBlockers(sample), [])
})

test('summary follows the dependency chain in business days', () => {
  const s = summarizeTemplate(sample)
  // a1: days 1-5, a2 milestone day 6, a3 days 7-10, a4 day 11
  assert.equal(s.estimatedBusinessDays, 11)
  assert.equal(s.activities, 4)
  assert.equal(s.milestones, 1)
  assert.equal(s.inspections, 1)
  assert.equal(s.dependencies, 3)
})

test('activities without a duration are undated and block their successors', () => {
  const s = summarizeTemplate({ phases: [{ name: 'P', activities: [act('a1', null), act('a2', 3, ['a1']), act('a3', 2)] }] })
  assert.equal(s.undated, 2)
  assert.equal(s.estimatedBusinessDays, 2)
})

test('removing an activity or phase removes dependencies that pointed to it', () => {
  const noA1 = removeActivity(sample, 'a1')
  assert.deepEqual(noA1.phases[0].activities[0].predecessors, [])
  const noFirst = removePhase(sample, 0)
  assert.equal(noFirst.phases.length, 1)
  assert.deepEqual(noFirst.phases[0].activities[0].predecessors, [])
})

test('reordering prunes dependencies that would point forward', () => {
  const moved = { phases: moveItem(sample.phases, 1, 0) }
  const { content, removed } = pruneForwardDependencies(moved)
  assert.equal(removed, 1)
  assert.equal(validateTemplateContent(content).ok, true)
})

test('moveItem ignores out-of-range moves', () => {
  const items = [1, 2, 3]
  assert.equal(moveItem(items, 0, 5), items)
  assert.deepEqual(moveItem(items, 0, 2), [2, 3, 1])
})

test('business days between counts weekdays inclusive', () => {
  assert.equal(businessDaysBetween('2026-11-02', '2026-11-06'), 5)
  assert.equal(businessDaysBetween('2026-11-06', '2026-11-09'), 2)
  assert.equal(businessDaysBetween('2026-11-09', '2026-11-06'), null)
  assert.equal(businessDaysBetween(null, '2026-11-06'), null)
})

test('a project schedule becomes sanitized template content', () => {
  const content = projectScheduleToTemplate({
    phases: [
      { id: 'p2', name: 'Framing', sort_order: 1 },
      { id: 'p1', name: 'Foundation', sort_order: 0 },
    ],
    activities: [
      { id: 'x1', name: 'Footings', phase_id: 'p1', phase: null, activity_type: 'task', sort_order: 0, weight: 4, planned_start: '2026-11-02', planned_end: '2026-11-05', status: 'completed' },
      { id: 'x2', name: 'Walls', phase_id: 'p2', phase: null, activity_type: 'task', sort_order: 1, weight: '6', planned_start: null, planned_end: null, status: 'not_started' },
      { id: 'x3', name: 'Skip me', phase_id: 'p2', phase: null, activity_type: 'task', sort_order: 2, weight: 1, planned_start: null, planned_end: null, status: 'skipped' },
      { id: 'x4', name: 'Loose', phase_id: null, phase: 'Unknown', activity_type: 'weird', sort_order: 3, weight: null, planned_start: null, planned_end: null, status: 'not_started' },
    ],
    dependencies: [
      { predecessor_id: 'x1', successor_id: 'x2' },
      { predecessor_id: 'x2', successor_id: 'x1' },
    ],
  })
  assert.deepEqual(content.phases.map((p) => p.name), ['Foundation', 'Framing', 'Other work'])
  const [footings] = content.phases[0].activities
  assert.equal(footings.duration_days, 4)
  assert.deepEqual(footings.predecessors, [])
  assert.deepEqual(content.phases[1].activities.map((a) => a.name), ['Walls'])
  assert.deepEqual(content.phases[1].activities[0].predecessors, [footings.key])
  assert.equal(content.phases[2].activities[0].type, 'task')
  assert.equal(validateTemplateContent(content).ok, true)
  assert.ok(!JSON.stringify(content).includes('2026'))
})

test('malformed stored content reads as empty', () => {
  assert.deepEqual(readTemplateContent({ phases: 'nope' }), { phases: [] })
  assert.deepEqual(readTemplateContent(null), { phases: [] })
})

const tl = (over: Partial<Parameters<typeof buildJobTimeline>[1][number]>) => ({
  id: Math.random().toString(36),
  name: 'A',
  phase_id: 'p1',
  phase: null,
  status: 'not_started',
  activity_type: 'task',
  planned_start: null,
  planned_end: null,
  sort_order: 0,
  ...over,
})

test('timeline derives phase states, current phase, and health', () => {
  const t = buildJobTimeline(
    [
      { id: 'p1', name: 'Foundation', sort_order: 0 },
      { id: 'p2', name: 'Framing', sort_order: 1 },
      { id: 'p3', name: 'Empty', sort_order: 2 },
    ],
    [
      tl({ phase_id: 'p1', status: 'completed', planned_start: '2026-11-02', planned_end: '2026-11-05' }),
      tl({ phase_id: 'p2', status: 'in_progress', planned_start: '2026-11-09', planned_end: '2026-11-20', sort_order: 1 }),
      tl({ phase_id: 'p2', activity_type: 'milestone', name: 'Dried in', planned_end: '2026-11-23', sort_order: 2 }),
    ],
    '2026-11-12',
    '2026-12-31',
  )
  assert.deepEqual(t.phases.map((p) => p.state), ['complete', 'in_progress'])
  assert.equal(t.phases[1].isCurrent, true)
  assert.equal(t.health, 'on_track')
  assert.equal(t.milestones.length, 1)
  assert.equal(t.forecastEnd, '2026-11-23')
})

test('timeline flags overdue work and forecasts past target', () => {
  const behind = buildJobTimeline([], [tl({ phase_id: null, planned_start: '2026-11-02', planned_end: '2026-11-05' })], '2026-11-12')
  assert.equal(behind.health, 'behind')
  assert.equal(behind.phases[0].name, 'Other work')
  assert.equal(behind.phases[0].state, 'delayed')
  const risk = buildJobTimeline([], [tl({ planned_start: '2026-12-01', planned_end: '2027-02-01' })], '2026-11-12', '2027-01-15')
  assert.equal(risk.health, 'at_risk')
  assert.equal(buildJobTimeline([], [tl({})], '2026-11-12').health, 'not_scheduled')
  assert.equal(buildJobTimeline([], [], '2026-11-12').health, 'empty')
})
