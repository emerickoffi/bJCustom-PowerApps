import { isSwitchable, type FeatureDefinition, type FeatureKey, type FeatureMap } from './feature-registry.ts'

export type Availability = 'core' | 'included' | 'available' | 'partial' | 'setup_required' | 'planned'

/** Technical implementation state, independent of whether this company has the feature turned on. */
export function featureAvailability(f: FeatureDefinition): Availability {
  if (f.core) return 'core'
  if (f.setupRequired) return 'setup_required'
  if (!f.available) return 'planned'
  if (f.partial) return 'partial'
  if (f.includedWith) return 'included'
  return 'available'
}

/** Prerequisites (from `requires` and `includedWith`) that are currently off. */
export function missingPrerequisites(defs: FeatureDefinition[], map: FeatureMap, key: FeatureKey): FeatureKey[] {
  const f = defs.find((d) => d.key === key)
  if (!f) return []
  const needs = f.includedWith ? [f.includedWith, ...f.requires] : f.requires
  return [...new Set(needs)].filter((r) => r !== key && !map[r])
}

/**
 * Switchable features that are on and depend on `key`, directly or transitively, ordered so that each
 * one appears before anything it depends on. Turning them off in this order never violates the
 * database dependency guard.
 */
export function activeDependents(defs: FeatureDefinition[], map: FeatureMap, key: FeatureKey): FeatureKey[] {
  const order: FeatureKey[] = []
  const visit = (target: FeatureKey, seen: Set<FeatureKey>) => {
    for (const d of defs) {
      if (!isSwitchable(d) || !map[d.key] || seen.has(d.key) || !d.requires.includes(target)) continue
      seen.add(d.key)
      visit(d.key, seen)
      order.push(d.key)
    }
  }
  visit(key, new Set([key]))
  return order
}

export type RowMessage = { tone: 'warning' | 'info'; text: string } | null

/** The single most useful message for a feature row, or null when nothing needs saying. */
export function rowMessage(
  defs: FeatureDefinition[],
  map: FeatureMap,
  f: FeatureDefinition,
  labelOf: (k: FeatureKey) => string,
): RowMessage {
  const availability = featureAvailability(f)
  if (availability === 'planned') return null
  if (availability === 'core') return f.coreNote ? { tone: 'info', text: f.coreNote } : null
  if (availability === 'setup_required') {
    if (map[f.key] && !f.lockWhenSetupRequired) return f.setupNote ? { tone: 'warning', text: f.setupNote } : null
    return { tone: 'warning', text: f.setupNote ?? 'Finish setup before turning this on.' }
  }
  if (f.includedWith) {
    const missing = missingPrerequisites(defs, map, f.key)
    const base = f.partialNote ?? `Included with ${labelOf(f.includedWith)}.`
    return missing.length
      ? { tone: 'info', text: `${base} Turn on ${missing.map(labelOf).join(' and ')} to use it.` }
      : { tone: 'info', text: base }
  }
  if (!map[f.key]) {
    const missing = missingPrerequisites(defs, map, f.key)
    if (missing.length) return { tone: 'warning', text: `Needs ${missing.map(labelOf).join(' and ')}. Turn ${missing.length > 1 ? 'them' : 'it'} on first.` }
    return null
  }
  const dependents = activeDependents(defs, map, f.key)
  if (dependents.length) return { tone: 'info', text: `Used by ${dependents.map(labelOf).join(' and ')}.` }
  return null
}

/** Whether the switch can be used right now. Turning off with active dependents goes through a confirmation instead. */
export function canToggle(defs: FeatureDefinition[], map: FeatureMap, f: FeatureDefinition): boolean {
  if (!isSwitchable(f)) return false
  if (map[f.key]) return true
  if (f.setupRequired && f.lockWhenSetupRequired) return false
  return missingPrerequisites(defs, map, f.key).length === 0
}
