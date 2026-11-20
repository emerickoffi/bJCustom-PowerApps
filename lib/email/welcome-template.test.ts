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

describe('help request emails', async () => {
  const { renderSupportTicketEmails } = await import('./templates.ts')
  const base = {
    reference: 'HELP-1042',
    subject: 'Cannot save estimate',
    message: 'It spins and fails <script>alert(1)</script>',
    requesterName: 'Pat PM',
    requesterEmail: 'pat@builder.com',
    requesterRole: 'project_manager',
    organizationName: 'Builder A',
    projectName: 'Oak St',
    pagePath: '/projects/x/estimates/y',
    browser: 'Chrome on Mac',
    lastError: 'Something went wrong. Please try again.',
    supportAccessMinutes: 60,
    responsePromise: 'We reply within 1 business day.',
  }
  it('puts the ticket number in the subject and escapes what people typed', () => {
    const { toSupport, receipt } = renderSupportTicketEmails(base, 'https://app.trefortpro.com')
    assert.ok(toSupport.ok && receipt.ok)
    if (!toSupport.ok || !receipt.ok) return
    assert.equal(toSupport.email.subject, '[HELP-1042] Cannot save estimate')
    assert.ok(!toSupport.email.html.includes('<script>'))
    assert.ok(toSupport.email.text.includes('Last error they saw'))
    assert.ok(toSupport.email.text.includes('Support access: granted for 60 minutes'))
    assert.ok(receipt.email.subject.includes('HELP-1042'))
  })
})
