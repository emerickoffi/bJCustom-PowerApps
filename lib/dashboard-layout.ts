import type { OrgRole } from './domain.ts'

/**
 * Dashboard personalization registry. A saved layout only stores widget ids, order, and visibility.
 * It is re-resolved against the user's current role and enabled modules on every read, so a stale or
 * tampered layout can never surface a widget the user is not allowed to see.
 */

export type DashboardKey = 'owner' | 'project_manager' | 'builder_staff'

export const LAYOUT_SCHEMA_VERSION = 1

export type WidgetId =
  // Owner Command Center
  | 'welcome'
  | 'kpis'
  | 'attention'
  | 'priority_jobs'
  | 'coming_up'
  | 'warranty'
  | 'recent_activity'
  | 'pipeline'
  // Field workspace (project manager and builder staff)
  | 'current_job'
  | 'focus'
  | 'quick_actions'
  | 'job_actions'
  | 'assigned_jobs'
  | 'upcoming_work'
  | 'job_glance'
  | 'project_health'
  | 'job_updates'

/** Region a widget renders in. Reordering only changes order within a region. */
export type WidgetRegion = 'header' | 'main' | 'rail' | 'footer'

export type WidgetRequirement = 'schedule' | 'warranty' | 'daily_logs'

export type WidgetDef = {
  id: WidgetId
  label: string
  description: string
  region: WidgetRegion
  /** Always shown in a fixed position; not listed in Customize. */
  fixed?: boolean
  /** Listed and movable, but cannot be hidden (critical entry points such as the Action Center). */
  locked?: boolean
  /** Desktop width inside a two-column region. */
  span?: 'full' | 'half'
  requires?: WidgetRequirement
}

const OWNER_WIDGETS: WidgetDef[] = [
  { id: 'welcome', label: 'Welcome', description: 'Greeting and action total', region: 'header', fixed: true },
  { id: 'kpis', label: 'Key figures', description: 'Financial and schedule metrics', region: 'header', fixed: true },
  { id: 'attention', label: 'Action Center', description: 'Items that need you', region: 'main', fixed: true },
  { id: 'priority_jobs', label: 'Priority jobs', description: 'Jobs ranked by urgency', region: 'main', fixed: true },
  { id: 'coming_up', label: 'Coming up', description: 'Starts, milestones, and expirations', region: 'rail' },
  { id: 'warranty', label: 'Warranty', description: 'Open claims and coverage', region: 'rail', requires: 'warranty' },
  { id: 'recent_activity', label: 'Recent activity', description: 'Latest changes across jobs', region: 'rail' },
  { id: 'pipeline', label: 'Pipeline', description: 'Job counts by stage', region: 'footer' },
]

const FIELD_WIDGETS = {
  current_job: { label: 'Current job', description: 'The job you are working on', region: 'header', fixed: true },
  focus: { label: 'Focus', description: 'The single most important next step', region: 'main', span: 'full' },
  quick_actions: { label: 'Quick actions', description: 'Log, photo, punch list, contacts', region: 'main', span: 'full' },
  job_actions: { label: 'On this job', description: 'Action Center items for this job', region: 'main', span: 'half', locked: true },
  assigned_jobs: { label: 'My jobs', description: 'Jobs you are assigned to', region: 'main', span: 'half' },
  upcoming_work: { label: 'Upcoming work', description: 'Activities and punch items due soon', region: 'main', span: 'half', requires: 'schedule' },
  job_glance: { label: 'Job at a glance', description: 'Stage, dates, homeowner, manager', region: 'main', span: 'half' },
  project_health: { label: 'Project health', description: 'Health across your active jobs', region: 'main', span: 'full' },
  job_updates: { label: 'Job updates', description: 'Recent daily logs for this job', region: 'main', span: 'half', requires: 'daily_logs' },
} satisfies Record<string, Omit<WidgetDef, 'id'>>

type FieldWidgetId = keyof typeof FIELD_WIDGETS

function field(ids: FieldWidgetId[]): WidgetDef[] {
  return ids.map((id) => ({ id, ...FIELD_WIDGETS[id] }))
}

/** Default order and the widgets each dashboard offers. Order here is the default order. */
const REGISTRY: Record<DashboardKey, { widgets: WidgetDef[]; hiddenByDefault: WidgetId[] }> = {
  owner: { widgets: OWNER_WIDGETS, hiddenByDefault: [] },
  project_manager: {
    widgets: field([
      'current_job',
      'focus',
      'quick_actions',
      'job_actions',
      'assigned_jobs',
      'upcoming_work',
      'job_glance',
      'project_health',
      'job_updates',
    ]),
    hiddenByDefault: [],
  },
  builder_staff: {
    widgets: field(['current_job', 'focus', 'quick_actions', 'job_actions', 'job_glance', 'upcoming_work', 'job_updates', 'assigned_jobs']),
    hiddenByDefault: [],
  },
}

export function dashboardKeyForRole(role: OrgRole | null): DashboardKey | null {
  if (role === 'org_admin') return 'owner'
  if (role === 'project_manager') return 'project_manager'
  if (role === 'builder_staff') return 'builder_staff'
  return null
}

export type LayoutEntry = { id: WidgetId; visible: boolean }
export type ResolvedWidget = WidgetDef & { visible: boolean }

/** Widgets this user may see right now, in default order. */
export function permittedWidgets(key: DashboardKey, available: Partial<Record<WidgetRequirement, boolean>>): WidgetDef[] {
  return REGISTRY[key].widgets.filter((w) => !w.requires || available[w.requires] === true)
}

export function defaultLayout(key: DashboardKey, available: Partial<Record<WidgetRequirement, boolean>>): LayoutEntry[] {
  const hidden = new Set(REGISTRY[key].hiddenByDefault)
  return permittedWidgets(key, available).map((w) => ({ id: w.id, visible: !hidden.has(w.id) }))
}

/** Parses untrusted stored or submitted JSON into a list of entries. Unknown shapes become an empty list. */
export function parseLayoutEntries(raw: unknown): LayoutEntry[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { widgets?: unknown }).widgets) ? (raw as { widgets: unknown[] }).widgets : []
  const out: LayoutEntry[] = []
  for (const item of list.slice(0, 50)) {
    if (!item || typeof item !== 'object') continue
    const { id, visible } = item as { id?: unknown; visible?: unknown }
    if (typeof id !== 'string' || typeof visible !== 'boolean') continue
    out.push({ id: id as WidgetId, visible })
  }
  return out
}

/**
 * Merges a saved layout with the current registry: keeps saved order and visibility for widgets that are
 * still permitted, drops unknown or no-longer-permitted ids, appends newly permitted widgets with their
 * default visibility, and forces locked and fixed widgets visible.
 */
export function resolveLayout(
  key: DashboardKey,
  saved: LayoutEntry[] | null,
  available: Partial<Record<WidgetRequirement, boolean>>,
): ResolvedWidget[] {
  const permitted = permittedWidgets(key, available)
  const byId = new Map(permitted.map((w) => [w.id, w]))
  const defaults = new Map(defaultLayout(key, available).map((e) => [e.id, e.visible]))
  const seen = new Set<WidgetId>()
  const ordered: ResolvedWidget[] = []

  for (const entry of saved ?? []) {
    const def = byId.get(entry.id)
    if (!def || seen.has(def.id)) continue
    seen.add(def.id)
    ordered.push({ ...def, visible: def.fixed || def.locked ? true : entry.visible })
  }
  for (const def of permitted) {
    if (seen.has(def.id)) continue
    // New widgets are inserted at their default position relative to the registry order.
    const defaultIndex = permitted.indexOf(def)
    const before = permitted.slice(0, defaultIndex).map((w) => w.id)
    let insertAt = 0
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (before.includes(ordered[i].id)) {
        insertAt = i + 1
        break
      }
    }
    ordered.splice(insertAt, 0, { ...def, visible: def.fixed || def.locked ? true : (defaults.get(def.id) ?? true) })
    seen.add(def.id)
  }
  return ordered
}

/** Normalizes a submitted layout for storage. Only permitted ids survive; locked widgets stay visible. */
export function normalizeLayoutForSave(
  key: DashboardKey,
  submitted: unknown,
  available: Partial<Record<WidgetRequirement, boolean>>,
): { widgets: LayoutEntry[] } {
  return {
    widgets: resolveLayout(key, parseLayoutEntries(submitted), available)
      .filter((w) => !w.fixed)
      .map((w) => ({ id: w.id, visible: w.visible })),
  }
}

export function visibleIn(widgets: ResolvedWidget[], region: WidgetRegion): ResolvedWidget[] {
  return widgets.filter((w) => w.region === region && w.visible)
}

/** Moves a widget one step within its own region. Returns the same array when the move is not possible. */
export function moveWidget<T extends { id: WidgetId; region: WidgetRegion }>(list: T[], id: WidgetId, direction: -1 | 1): T[] {
  const index = list.findIndex((w) => w.id === id)
  if (index === -1) return list
  const region = list[index].region
  let target = index + direction
  while (target >= 0 && target < list.length && list[target].region !== region) target += direction
  if (target < 0 || target >= list.length) return list
  const next = list.slice()
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
