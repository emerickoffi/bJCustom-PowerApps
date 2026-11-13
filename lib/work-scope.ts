export type WorkScope = 'mine' | 'all'

/** Display order for every ownership selector: My work first. Values stay bound to their own labels. */
export const WORK_SCOPE_OPTIONS: readonly { value: WorkScope; label: string }[] = [
  { value: 'mine', label: 'My work' },
  { value: 'all', label: 'All work' },
]

export const DEFAULT_WORK_SCOPE: WorkScope = 'mine'

/** A saved choice wins; anything missing or unrecognized falls back to My work. */
export function resolveWorkScope(saved: string | null | undefined): WorkScope {
  return saved === 'all' || saved === 'mine' ? saved : DEFAULT_WORK_SCOPE
}

export function workScopeEmptyMessage(scope: WorkScope): string {
  return scope === 'mine' ? 'You’re all caught up.' : 'No pending actions in this view.'
}

/** The action list loaded with every module checked and nothing pending. */
export function actionListClear(list: { itemCount: number; unavailableCount: number }): boolean {
  return list.itemCount === 0 && list.unavailableCount === 0
}

/** The briefing loaded successfully (no failed refresh, every source checked) and has nothing ranked. */
export function briefingClear(briefing: { itemCount: number; uncheckedCount: number; failed?: boolean }): boolean {
  return briefing.itemCount === 0 && briefing.uncheckedCount === 0 && !briefing.failed
}

/**
 * Only a briefing for the current scope and project may be shown. Guards against a response for the previous scope
 * landing after the user switched.
 */
export function briefingMatches(
  briefing: { scope: WorkScope; projectId: string | null } | null | undefined,
  expected: { scope: WorkScope; projectId: string | null },
): boolean {
  return !!briefing && briefing.scope === expected.scope && (briefing.projectId ?? null) === (expected.projectId ?? null)
}
