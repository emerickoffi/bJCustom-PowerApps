import type { DashboardLayout, VisibilityItemId } from '@/lib/dashboard-visibility'
import type { OrgRole } from '@/lib/domain'

export type TabletShortcutKey = 'daily_log' | 'documents'
export type TabletShortcut = { key: TabletShortcutKey; label: string; hint: string; href: string }

const DAILY_LOG_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff']

/**
 * Today-tab shortcuts into existing workflows. Each mirrors its destination's guard (feature switch, role), and
 * the destination re-checks access server-side.
 *
 * - With a project selected, links carry it; `/daily-logs/new` only jumps to that project's form when it is an
 *   eligible log project, otherwise it shows its own project picker.
 * - With All projects, links open the unscoped page, which asks for a project. Nothing is chosen silently.
 *
 * Not offered: Take photo (the floating camera only attaches to an uploader on the current record, so Home has no
 * valid destination) and To-dos (no such module exists).
 */
export function buildTabletShortcuts(input: {
  role: OrgRole | null
  features: { daily_logs?: boolean; documents?: boolean }
  project: { id: string; name: string } | null
}): TabletShortcut[] {
  const { role, features, project } = input
  const id = project ? encodeURIComponent(project.id) : null
  const shortcuts: TabletShortcut[] = []
  if (features.daily_logs && role && DAILY_LOG_ROLES.includes(role)) {
    shortcuts.push({
      key: 'daily_log',
      label: 'Daily log',
      hint: project ? project.name : 'Choose a project',
      href: id ? `/daily-logs/new?project=${id}` : '/daily-logs/new',
    })
  }
  if (features.documents) {
    shortcuts.push({
      key: 'documents',
      label: 'Documents',
      hint: project ? project.name : 'All projects',
      href: id ? `/documents?project=${id}` : '/documents',
    })
  }
  return shortcuts
}

/**
 * Tablet Home tab placement.
 *
 * The tablet Home has no editor of its own: it reads the same saved desktop layout and visibility that the
 * Standard dashboard uses, and never writes to them.
 *
 * - Today:     weather (inside the greeting), attention, my_todos, coming_up (shown as "My day").
 * - Job focus: priority_jobs.
 * - Overview:  key-figure cards (kpis), then pipeline, recent_activity.
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
  my_todos: 'today',
  coming_up: 'today',
  priority_jobs: 'jobs',
  pipeline: 'overview',
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
