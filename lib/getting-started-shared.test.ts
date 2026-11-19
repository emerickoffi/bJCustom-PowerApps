import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildChecklist, type GettingStartedInput } from './getting-started-shared.ts'

const fresh: GettingStartedInput = {
  sampleProjectId: null,
  sampleEverLoaded: false,
  hasLogo: false,
  hasContactDetails: false,
  reviewedModules: false,
  realProjectCount: 0,
  staffMemberCount: 1,
  pendingStaffInvites: 0,
  hasSubscription: false,
  dismissed: false,
}

describe('getting started checklist', () => {
  it('starts with nothing done and offers to add the sample project', () => {
    const c = buildChecklist(fresh)
    assert.equal(c.visible, true)
    assert.equal(c.doneCount, 0)
    const sample = c.steps.find((s) => s.id === 'sample')!
    assert.equal(sample.href, null)
    assert.equal(sample.cta, 'Add sample project')
  })

  it('links to a live sample and counts an archived one as explored', () => {
    const live = buildChecklist({ ...fresh, sampleProjectId: 'p1', sampleEverLoaded: true })
    assert.equal(live.steps[0].href, '/projects/p1')
    assert.equal(live.steps[0].done, true)
    const archived = buildChecklist({ ...fresh, sampleProjectId: null, sampleEverLoaded: true })
    assert.equal(archived.steps[0].done, true)
  })

  it('needs both a logo and contact details for the company step', () => {
    assert.equal(buildChecklist({ ...fresh, hasLogo: true }).steps[1].done, false)
    assert.equal(buildChecklist({ ...fresh, hasLogo: true, hasContactDetails: true }).steps[1].done, true)
  })

  it('treats a pending invitation as inviting the team', () => {
    assert.equal(buildChecklist({ ...fresh, pendingStaffInvites: 1 }).steps.find((s) => s.id === 'team')!.done, true)
    assert.equal(buildChecklist({ ...fresh, staffMemberCount: 2 }).steps.find((s) => s.id === 'team')!.done, true)
  })

  it('hides when dismissed or when every step is done', () => {
    assert.equal(buildChecklist({ ...fresh, dismissed: true }).visible, false)
    const all = buildChecklist({
      sampleProjectId: 'p1',
      sampleEverLoaded: true,
      hasLogo: true,
      hasContactDetails: true,
      reviewedModules: true,
      realProjectCount: 1,
      staffMemberCount: 3,
      pendingStaffInvites: 0,
      hasSubscription: true,
      dismissed: false,
    })
    assert.equal(all.doneCount, 6)
    assert.equal(all.visible, false)
  })
})
