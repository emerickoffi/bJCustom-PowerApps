import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildSettingsNav, getActiveSettingsHref } from './settings-nav.ts'

const all = buildSettingsNav({ schedule: true, estimates: true })

describe('buildSettingsNav', () => {
  it('keeps every existing settings route when all modules are on', () => {
    assert.deepEqual(
      all.map((i) => i.href),
      [
        '/settings',
        '/settings/integrations',
        '/settings/dashboard',
        '/settings/features',
        '/settings/templates',
        '/settings/proposal-templates',
        '/settings/selection-categories',
        '/settings/roles',
      ],
    )
  })

  it('hides module tabs exactly as the old header buttons did', () => {
    const hrefs = buildSettingsNav({}).map((i) => i.href)
    assert.ok(!hrefs.includes('/settings/templates'))
    assert.ok(!hrefs.includes('/settings/proposal-templates'))
    assert.ok(!hrefs.includes('/settings/selection-categories'))
    assert.ok(hrefs.includes('/settings/roles'))
  })
})

describe('getActiveSettingsHref', () => {
  it('matches the company tab only on /settings itself', () => {
    assert.equal(getActiveSettingsHref('/settings', all), '/settings')
    assert.equal(getActiveSettingsHref('/settings/', all), '/settings')
    assert.equal(getActiveSettingsHref('/settings/roles', all), '/settings/roles')
  })

  it('keeps a tab active on its nested routes', () => {
    assert.equal(getActiveSettingsHref('/settings/templates/abc/edit', all), '/settings/templates')
    assert.equal(getActiveSettingsHref('/settings/proposal-templates/new', all), '/settings/proposal-templates')
  })

  it('does not confuse prefix-sharing routes', () => {
    assert.equal(getActiveSettingsHref('/settings/templates-old', all), null)
    assert.equal(getActiveSettingsHref('/projects', all), null)
  })
})
