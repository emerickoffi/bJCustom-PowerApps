import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { renderEmail, type OutboxRow } from './templates.ts'

const row = (payload: Record<string, unknown>): OutboxRow => ({
  id: 1,
  event_key: 'welcome:org',
  organization_id: 'org',
  template: 'welcome',
  category: 'account',
  recipient_email: 'owner@example.com',
  payload,
  attempts: 0,
  max_attempts: 6,
})

describe('welcome email', () => {
  it('greets by first name, shows the trial end date and links to the dashboard', () => {
    const r = renderEmail(row({ organization_name: 'Acme Homes', first_name: 'Dana', trial_ends_at: '2026-12-03T05:00:00Z' }), 'https://app.trefortpro.com')
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.email.subject, 'Welcome to Trefort, Dana')
    assert.match(r.email.text, /free until December 3, 2026/)
    assert.match(r.email.text, /Open your dashboard: https:\/\/app\.trefortpro\.com\/dashboard/)
    assert.match(r.email.html, /Harper Residence/)
  })

  it('falls back to the company name and escapes it in HTML', () => {
    const r = renderEmail(row({ organization_name: 'R&D <Builders>' }), 'https://app.trefortpro.com')
    assert.ok(r.ok)
    if (!r.ok) return
    assert.equal(r.email.subject, 'Welcome to Trefort, R&D <Builders>')
    assert.ok(!r.email.html.includes('<Builders>'))
    assert.doesNotMatch(r.email.text, /free until/)
  })
})
