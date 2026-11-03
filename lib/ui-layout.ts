/**
 * Staff layout presentation. Standard is the existing sidebar shell; Tablet is the touch shell with a bottom
 * navigation and the tabbed Home. Automatic picks Tablet from viewport size, using the primary pointer only as
 * supporting evidence. Device names and user agents are never consulted.
 *
 * Both queries are mirrored literally in the `tablet` custom variant in app/globals.css, so CSS (first paint) and
 * JavaScript (after hydration) always agree. Change them together.
 *
 * - Phones (< 600px wide, or < 600px tall in landscape) keep the current phone experience in every mode.
 * - Automatic covers iPad mini through iPad Pro 12.9"/13" in both orientations (744–1366px) and 1/2 or 2/3
 *   split-screen widths from 600px; a fine primary pointer (desktop, touch laptop) stays Standard.
 */
export type LayoutPreference = 'auto' | 'standard' | 'tablet'

export const LAYOUT_PREFERENCES: readonly LayoutPreference[] = ['auto', 'standard', 'tablet']

export const LAYOUT_LABELS: Record<LayoutPreference, string> = {
  auto: 'Automatic',
  standard: 'Standard',
  tablet: 'Tablet',
}

export const TABLET_FORCED_QUERY = '(min-width: 600px)'
export const TABLET_AUTO_QUERY =
  '(min-width: 600px) and (max-width: 1400px) and (min-height: 600px) and (pointer: coarse)'

export function parseLayoutPreference(value: string | null | undefined): LayoutPreference {
  return value === 'standard' || value === 'tablet' ? value : 'auto'
}

/** The media query under which Tablet applies for a preference; null when it never applies. */
export function tabletQueryFor(preference: LayoutPreference): string | null {
  if (preference === 'standard') return null
  return preference === 'tablet' ? TABLET_FORCED_QUERY : TABLET_AUTO_QUERY
}
