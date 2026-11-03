import type { DashboardLayout, VisibilityItemId } from '@/lib/dashboard-visibility'

/**
 * Tablet Home tab placement.
 *
 * The tablet Home has no editor of its own: it reads the same saved desktop layout and visibility that the
 * Standard dashboard uses, and never writes to them.
 *
 * - Today:     weather (inside the greeting), attention, coming_up (shown as "My day").
 * - Job focus: priority_jobs.
 * - Overview:  key-figure cards (kpis), then pipeline, warranty, recent_activity.
 *
 * Within a tab, sections keep their relative saved order, read across the desktop areas top to bottom
 * (above, main, side, below). Hidden or unavailable sections are dropped, so they never leave blank slots.
 */
export const TABLET_TABS = ['today', 'jobs', 'overview'] as const
export type TabletTab = (typeof TABLET_TABS)[number]

export const TABLET_TAB_LABELS: Record<TabletTab, string> = {
  today: 'Today',
  jobs: 'Job focus',
  overview: 'Overview',
}

export const DEFAULT_TABLET_TAB: TabletTab = 'today'

export function parseTabletTab(value: string | null | undefined): TabletTab {
  return (TABLET_TABS as readonly string[]).includes(value ?? '') ? (value as TabletTab) : DEFAULT_TABLET_TAB
}

const TAB_FOR_SECTION: Partial<Record<VisibilityItemId, TabletTab>> = {
  attention: 'today',
  coming_up: 'today',
  priority_jobs: 'jobs',
  pipeline: 'overview',
  warranty: 'overview',
  recent_activity: 'overview',
}

const AREA_ORDER = ['above', 'main', 'side', 'below'] as const

/** Visible sections for one tablet tab, in their relative saved order. */
export function tabletSections(
  layout: Pick<DashboardLayout, (typeof AREA_ORDER)[number]>,
  tab: TabletTab,
  isShown: (id: VisibilityItemId) => boolean,
): VisibilityItemId[] {
  return AREA_ORDER.flatMap((area) => layout[area]).filter((id) => TAB_FOR_SECTION[id] === tab && isShown(id))
}
