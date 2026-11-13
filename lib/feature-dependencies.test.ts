import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { FEATURES, featureLabel, isSwitchable, resolveFeatures, type FeatureKey } from './feature-registry.ts'
import { activeDependents, canToggle, featureAvailability, missingPrerequisites, rowMessage } from './feature-dependencies.ts'

const def = (key: FeatureKey) => FEATURES.find((f) => f.key === key)!

/** Keys in the live public.feature_registry() as of this audit (rfis is not yet applied there). */
const DB_REGISTRY_KEYS: FeatureKey[] = [
  'consultation', 'schedule', 'estimates', 'walkthroughs', 'issues', 'warranty', 'portal', 'documents',
  'e_signatures', 'reports', 'invoices', 'payments', 'quickbooks', 'ai_assistant', 'daily_logs',
  'subcontractors', 'client_updates', 'change_orders', 'rfis',
]

describe('feature registry accuracy', () => {
  it('only offers switches for keys the database registry accepts', () => {
    for (const f of FEATURES.filter(isSwitchable)) assert.ok(DB_REGISTRY_KEYS.includes(f.key), f.key)
  })

  it('classifies Selections as implemented and governed by Estimates, not Planned', () => {
    assert.equal(featureAvailability(def('selections')), 'included')
    assert.equal(isSwitchable(def('selections')), false)
    assert.equal(resolveFeatures({ estimates: true }).selections, true)
    assert.equal(resolveFeatures({ estimates: false }).selections, false)
  })

  it('reflects shipped AI capabilities and keeps them off when the assistant is off', () => {
    for (const k of ['ai_estimate_review', 'ai_voice_punch', 'ai_quote_analysis'] as FeatureKey[]) {
      assert.equal(featureAvailability(def(k)), 'included', k)
    }
    assert.equal(featureAvailability(def('ai_schedule_advisor')), 'partial')
    assert.equal(featureAvailability(def('ai_warranty_assistance')), 'partial')
    const off = resolveFeatures({ ai_assistant: false, estimates: true })
    assert.equal(off.ai_estimate_review, false)
    const on = resolveFeatures({ ai_assistant: true, estimates: true, subcontractors: false })
    assert.equal(on.ai_estimate_review, true)
    assert.equal(on.ai_quote_analysis, false, 'quote comparison also needs Subcontractors')
  })

  it('never enables a planned feature from a stored preference', () => {
    const map = resolveFeatures({ consultation: true, payments: true, quickbooks: true } as never)
    assert.equal(map.consultation, false)
    assert.equal(map.payments, false)
    assert.equal(map.quickbooks, false)
  })

  it('preserves stored company preferences for switchable features', () => {
    const map = resolveFeatures({ schedule: false, documents: true, invoices: true })
    assert.equal(map.schedule, false)
    assert.equal(map.documents, true)
    assert.equal(map.invoices, true)
    assert.equal(resolveFeatures({}).documents, false, 'default stays off')
  })
})

describe('dependency direction', () => {
  const both = resolveFeatures({ documents: true, e_signatures: true })
  const docsOnly = resolveFeatures({ documents: true, e_signatures: false })
  const none = resolveFeatures({ documents: false, e_signatures: true })

  it('blocks enabling Electronic signatures without Documents', () => {
    assert.equal(none.e_signatures, false, 'a stored "on" without Documents still resolves off')
    assert.deepEqual(missingPrerequisites(FEATURES, none, 'e_signatures'), ['documents'])
    assert.equal(canToggle(FEATURES, none, def('e_signatures')), false)
    assert.match(rowMessage(FEATURES, none, def('e_signatures'), featureLabel)!.text, /^Needs Documents/)
  })

  it('lets Electronic signatures turn on once Documents is on', () => {
    assert.equal(canToggle(FEATURES, docsOnly, def('e_signatures')), true)
    assert.equal(rowMessage(FEATURES, docsOnly, def('e_signatures'), featureLabel), null)
  })

  it('routes turning Documents off through dependents instead of looking broken', () => {
    assert.deepEqual(activeDependents(FEATURES, both, 'documents'), ['e_signatures'])
    assert.equal(canToggle(FEATURES, both, def('documents')), true, 'switch stays usable; a confirmation resolves dependents')
    const msg = rowMessage(FEATURES, both, def('documents'), featureLabel)!
    assert.equal(msg.tone, 'info')
    assert.equal(msg.text, 'Used by Electronic signatures.')
    assert.deepEqual(activeDependents(FEATURES, docsOnly, 'documents'), [])
  })

  it('orders transitive dependents so the database guard is never violated', () => {
    const map = resolveFeatures({ portal: true, client_updates: true })
    assert.deepEqual(activeDependents(FEATURES, map, 'portal'), ['client_updates'])
    const walk = resolveFeatures({ walkthroughs: true, reports: true })
    assert.deepEqual(activeDependents(FEATURES, walk, 'walkthroughs'), ['reports'])
  })

  it('ignores display-only entries when resolving dependents', () => {
    const map = resolveFeatures({ ai_assistant: true, estimates: true })
    assert.deepEqual(activeDependents(FEATURES, map, 'ai_assistant'), [])
    assert.deepEqual(activeDependents(FEATURES, map, 'estimates'), [])
  })
})

describe('setup locks', () => {
  it('keeps migration-gated switches locked while off, but always allows turning off', () => {
    const rfis = { ...def('rfis'), setupRequired: true }
    assert.equal(canToggle(FEATURES, resolveFeatures({}), rfis), false)
    assert.equal(canToggle(FEATURES, resolveFeatures({ rfis: true }), rfis), true)
    assert.equal(rowMessage(FEATURES, resolveFeatures({}), rfis, featureLabel)!.tone, 'warning')
  })

  it('shows nothing for planned features and never offers a switch', () => {
    assert.equal(featureAvailability(def('consultation')), 'planned')
    assert.equal(canToggle(FEATURES, resolveFeatures({}), def('consultation')), false)
    assert.equal(rowMessage(FEATURES, resolveFeatures({}), def('consultation'), featureLabel), null)
  })
})
