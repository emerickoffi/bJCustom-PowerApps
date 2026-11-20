import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeatherAlerts, dayHazards, sensitiveWork } from './weather-risk.ts'

const day = (date: string, over: Record<string, unknown> = {}) => ({ date, label: 'Tue', rainChance: 10, kind: 'clear' as const, low: 50, wind: 'S 5 to 10 mph', ...over })

describe('jobsite weather warnings', () => {
  it('recognises weather-sensitive work', () => {
    assert.equal(sensitiveWork('Pour driveway')?.label, 'Concrete')
    assert.deepEqual(sensitiveWork('Roof shingles')?.hazards, ['rain', 'wind'])
    assert.equal(sensitiveWork('Rough Soil Grading & Drainage')?.label, 'Earthwork')
    assert.equal(sensitiveWork('Material Procurement'), null)
    assert.equal(sensitiveWork('Interior paint'), null)
    assert.equal(sensitiveWork('Rough Plumbing Under House or Foundation'), null)
    assert.equal(sensitiveWork('Foundation inspection'), null)
  })

  it('reads hazards from a forecast day', () => {
    assert.deepEqual(dayHazards(day('d', { rainChance: 70 })), { rain: 70 })
    assert.deepEqual(dayHazards(day('d', { low: 28 })), { freeze: 28 })
    assert.deepEqual(dayHazards(day('d', { wind: 'NW 20 to 30 mph' })), { wind: 30 })
    assert.deepEqual(dayHazards(day('d', { kind: 'storm', rainChance: 30 })), { rain: 30 })
    assert.deepEqual(dayHazards(day('d')), {})
  })

  it('warns only when sensitive work is scheduled that day', () => {
    const alerts = buildWeatherAlerts([
      {
        id: 'p1',
        name: 'Yaupon Dr',
        days: [day('2026-11-24', { rainChance: 70 }), day('2026-11-25', { rainChance: 80 })],
        activities: [
          { name: 'Pour foundation slab', start: '2026-11-24', end: '2026-11-24' },
          { name: 'Material Procurement', start: '2026-11-25', end: '2026-11-25' },
        ],
      },
    ])
    assert.equal(alerts.length, 1)
    assert.deepEqual(alerts[0], {
      projectId: 'p1', projectName: 'Yaupon Dr', date: '2026-11-24', dayLabel: 'Tue', hazard: 'rain', detail: 'Rain 70%', activities: ['Pour foundation slab'],
    })
  })

  it('counts multi-day activities and orders by date then severity', () => {
    const alerts = buildWeatherAlerts([
      {
        id: 'p1',
        name: 'A',
        days: [day('2026-11-25', { rainChance: 60, low: 30 })],
        activities: [{ name: 'Driveway concrete', start: '2026-11-23', end: '2026-11-26' }],
      },
    ])
    assert.deepEqual(alerts.map((a) => a.hazard), ['freeze', 'rain'])
  })
})
