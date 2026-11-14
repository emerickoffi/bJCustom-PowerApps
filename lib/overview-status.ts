/**
 * How a "nothing pending" section may describe itself. An empty list only reads as confirmed when every
 * source it depends on loaded; otherwise the wording says what could not be checked.
 */
export type AttentionState = 'items' | 'clear' | 'partial' | 'unavailable'

export function attentionState(args: {
  itemCount: number
  /** This section's own sources failed. */
  ownFailed: boolean
  /** Related sources shown elsewhere on the page failed (e.g. Communications). */
  relatedFailed: string[]
}): AttentionState {
  if (args.itemCount > 0) return 'items'
  if (args.ownFailed) return 'unavailable'
  if (args.relatedFailed.length > 0) return 'partial'
  return 'clear'
}

/** Names the sources that failed in plain language, e.g. "Questions (RFIs) and Client updates". */
export function listSources(sources: string[]): string {
  const unique = [...new Set(sources)]
  if (unique.length <= 1) return unique[0] ?? ''
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`
}
