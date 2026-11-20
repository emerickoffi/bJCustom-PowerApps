import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { describeBrowser, helpTopicFor, projectIdFromPath } from './help-topics.ts'

const P = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('helpTopicFor', () => {
  it('picks the most specific staff topic', () => {
    assert.equal(helpTopicFor('staff', `/projects/${P}/estimates/abc`).title, 'Estimates')
    assert.equal(helpTopicFor('staff', '/estimates').title, 'Estimates')
    assert.equal(helpTopicFor('staff', `/projects/${P}`).title, 'This project')
    assert.equal(helpTopicFor('staff', '/settings/support').title, 'Company settings')
    assert.equal(helpTopicFor('staff', '/dashboard').title, 'Getting around Trefort')
  })
  it('covers invitations for people who are signed out', () => {
    assert.equal(helpTopicFor('public', '/invite/abc123').title, 'Accepting an invitation')
    assert.equal(helpTopicFor('public', '/auth/login').title, 'Signing in')
  })
  it('always returns tips for every area', () => {
    for (const area of ['staff', 'portal', 'sub', 'public'] as const) {
      assert.ok(helpTopicFor(area, '/anything').tips.length > 0)
    }
  })
})

describe('projectIdFromPath', () => {
  it('reads the project only from that area’s project URLs', () => {
    assert.equal(projectIdFromPath('staff', `/projects/${P}/schedule`), P)
    assert.equal(projectIdFromPath('portal', `/portal/projects/${P}`), P)
    assert.equal(projectIdFromPath('staff', `/portal/projects/${P}`), null)
    assert.equal(projectIdFromPath('sub', `/projects/${P}`), null)
    assert.equal(projectIdFromPath('staff', '/projects/new'), null)
  })
})

describe('describeBrowser', () => {
  it('names common phones and browsers', () => {
    assert.equal(
      describeBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),
      'Safari on iPhone',
    )
    assert.equal(
      describeBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'),
      'Edge on Windows',
    )
    assert.equal(describeBrowser(''), 'a browser on unknown device')
  })
})
