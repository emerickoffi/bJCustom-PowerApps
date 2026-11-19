import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  describeSupportEvent,
  grantState,
  isSupportDuration,
  parseSupportSection,
  supportDbMessage,
  timeLeftLabel,
  type SupportEvent,
} from './support-access-shared.ts'

const now = new Date('2026-11-19T18:00:00Z')

describe('grantState', () => {
  it('is active until it expires', () => {
    assert.equal(grantState({ expires_at: '2026-11-19T18:30:00Z', revoked_at: null }, now), 'active')
    assert.equal(grantState({ expires_at: '2026-11-19T18:00:00Z', revoked_at: null }, now), 'expired')
  })
  it('revoked wins over time left', () => {
    assert.equal(grantState({ expires_at: '2026-11-19T19:00:00Z', revoked_at: '2026-11-19T17:59:00Z' }, now), 'revoked')
  })
})

describe('timeLeftLabel', () => {
  it('formats minutes and hours, rounding up', () => {
    assert.equal(timeLeftLabel('2026-11-19T18:00:30Z', now), '1 min left')
    assert.equal(timeLeftLabel('2026-11-19T18:42:00Z', now), '42 min left')
    assert.equal(timeLeftLabel('2026-11-19T19:00:00Z', now), '1 hr left')
    assert.equal(timeLeftLabel('2026-11-19T19:05:00Z', now), '1 hr 5 min left')
    assert.equal(timeLeftLabel('2026-11-19T17:00:00Z', now), 'Ended')
  })
})

describe('durations and sections', () => {
  it('accepts only the offered windows', () => {
    assert.ok(isSupportDuration(60))
    assert.ok(!isSupportDuration(45))
    assert.ok(!isSupportDuration(600))
  })
  it('falls back to overview for unknown sections', () => {
    assert.equal(parseSupportSection('rfis'), 'rfis')
    assert.equal(parseSupportSection('internal_notes'), 'overview')
    assert.equal(parseSupportSection(undefined), 'overview')
  })
})

describe('describeSupportEvent', () => {
  const base: SupportEvent = {
    id: '1',
    grant_id: 'g',
    actor_kind: 'support',
    actor_name: 'Sam Support',
    actor_email: 'sam@trefortpro.com',
    action: 'viewed',
    section: 'daily_logs',
    created_at: now.toISOString(),
  }
  it('names the person and what they opened', () => {
    assert.equal(describeSupportEvent(base), 'Sam Support (Trefort support) viewed Daily logs')
    assert.equal(
      describeSupportEvent({ ...base, actor_kind: 'company', actor_name: null, actor_email: 'bea@builder.com', action: 'granted' }),
      'bea@builder.com granted support access',
    )
  })
})

describe('supportDbMessage', () => {
  it('strips the Postgres prefix and ends with a period', () => {
    assert.equal(supportDbMessage('ERROR: Support already has access to this project'), 'Support already has access to this project.')
    assert.equal(supportDbMessage(null), 'Something went wrong. Try again.')
  })
})

describe('support view columns', async () => {
  const { SUPPORT_COLUMNS, humanize } = await import('./support-view-columns.ts')
  const { SUPPORT_SECTIONS } = await import('./support-access-shared.ts')
  it('has columns for every section except the overview', () => {
    for (const s of SUPPORT_SECTIONS) {
      if (s.key === 'overview') continue
      assert.ok(SUPPORT_COLUMNS[s.key].length > 0, s.key)
    }
  })
  it('never shows internal notes', () => {
    const keys = Object.values(SUPPORT_COLUMNS).flat().map((c) => c.key)
    assert.ok(!keys.some((k) => k.includes('internal')))
  })
  it('humanizes status values', () => {
    assert.equal(humanize('in_progress'), 'In progress')
  })
})
