import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { companyFeatureRows, companyStatus, describeEvent, filterCompanies, type PlatformCompanyRow } from './platform-shared.ts'

const row = (over: Partial<PlatformCompanyRow>): PlatformCompanyRow => ({
  id: '1',
  display_name: 'Acme Builders',
  legal_name: 'Acme Builders LLC',
  subscription_status: 'active',
  created_at: '2026-11-01T00:00:00Z',
  suspended_at: null,
  staff_count: 3,
  homeowner_count: 1,
  project_count: 4,
  last_activity_at: null,
  admin_emails: ['owner@acme.dev'],
  ...over,
})

describe('companyStatus', () => {
  it('shows suspension ahead of the subscription state', () => {
    assert.deepEqual(companyStatus({ suspended_at: '2026-11-17T00:00:00Z', subscription_status: 'active' }), { label: 'Suspended', tone: 'danger' })
  })
  it('labels billing states', () => {
    assert.equal(companyStatus({ suspended_at: null, subscription_status: 'internal' }).label, 'Internal')
    assert.equal(companyStatus({ suspended_at: null, subscription_status: 'past_due' }).tone, 'warning')
    assert.equal(companyStatus({ suspended_at: null, subscription_status: 'trialing' }).label, 'Trial')
  })
})

describe('filterCompanies', () => {
  const rows = [row({}), row({ id: '2', display_name: 'Brick & Co', legal_name: null, admin_emails: ['sam@brick.dev'] })]
  it('returns everything for an empty query', () => {
    assert.equal(filterCompanies(rows, '  ').length, 2)
  })
  it('matches name, legal name and admin email', () => {
    assert.deepEqual(filterCompanies(rows, 'brick').map((r) => r.id), ['2'])
    assert.deepEqual(filterCompanies(rows, 'llc').map((r) => r.id), ['1'])
    assert.deepEqual(filterCompanies(rows, 'SAM@').map((r) => r.id), ['2'])
  })
})

describe('companyFeatureRows', () => {
  it('lists only switchable modules', () => {
    const keys = companyFeatureRows({}).map((r) => r.feature.key)
    assert.ok(keys.includes('daily_logs'))
    assert.ok(!keys.includes('client_records'), 'core modules have no switch')
    assert.ok(!keys.includes('selections'), 'included modules follow their parent')
  })
  it('reports a switched-on module blocked by its dependency', () => {
    const esign = companyFeatureRows({ e_signatures: true, documents: false }).find((r) => r.feature.key === 'e_signatures')!
    assert.equal(esign.switchedOn, true)
    assert.equal(esign.effective, false)
    assert.deepEqual(esign.blockedBy, ['documents'])
  })
  it('uses defaults when a company never changed a switch', () => {
    const schedule = companyFeatureRows({}).find((r) => r.feature.key === 'schedule')!
    assert.equal(schedule.switchedOn, true)
    assert.equal(schedule.effective, true)
  })
})

describe('describeEvent', () => {
  it('names the module', () => {
    assert.equal(describeEvent({ action: 'feature_enabled', details: { feature: 'daily_logs' } }), 'Turned on Daily logs')
  })
  it('includes a suspension reason', () => {
    assert.equal(describeEvent({ action: 'company_suspended', details: { reason: 'Payment failed' } }), 'Suspended the company: Payment failed')
  })
})
