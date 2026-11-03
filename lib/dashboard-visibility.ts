/**
 * Command Center visibility settings. Presentation only: hiding an item never disables its module, workflows,
 * or permissions, and an item the viewer cannot access stays hidden whatever the setting says.
 */

export type ShowWhen = 'always' | 'records' | 'attention'

export type VisibilityItem = {
  id: string
  /** Header items live in the greeting row and have no layout position. */
  kind: 'card' | 'section' | 'header'
  label: string
  /** What "When relevant records exist" means for this item, in plain language. */
  records: string
  /** What "When attention is needed" means, or null when no reliable rule exists for this item. */
  attention: string | null
}

export const DASHBOARD_VISIBILITY_ITEMS = [
  {
    id: 'weather',
    kind: 'header',
    label: 'Jobsite Weather',
    records: 'Shown while at least one active project has a jobsite address to report weather for.',
    attention: null,
  },
  {
    id: 'card_approval',
    kind: 'card',
    label: 'Awaiting Your Approval',
    records: 'Shown while at least one signed estimate is waiting for your decision.',
    attention: null,
  },
  {
    id: 'card_contract',
    kind: 'card',
    label: 'Contract Value',
    records: 'Shown once at least one active project has an approved contract value.',
    attention: null,
  },
  {
    id: 'card_schedule',
    kind: 'card',
    label: 'Schedule Risk',
    records: 'Shown while at least one active job exists to assess.',
    attention: 'Shown only while at least one active job has a verified schedule risk.',
  },
  {
    id: 'card_receivables',
    kind: 'card',
    label: 'Receivables',
    records: 'Shown while at least one issued invoice has a balance due.',
    attention: 'Shown only while at least one issued invoice is past its due date.',
  },
  {
    id: 'attention',
    kind: 'section',
    label: 'Action Center',
    records: 'Shown while at least one action item is open.',
    attention: 'Shown only while at least one action item is marked critical, such as an overdue activity or invoice.',
  },
  {
    id: 'priority_jobs',
    kind: 'section',
    label: 'Priority Jobs',
    records: 'Shown while at least one job qualifies for the priority list.',
    attention: 'Shown only while at least one listed job is rated At risk or Needs attention by project health.',
  },
  {
    id: 'coming_up',
    kind: 'section',
    label: 'Coming Up',
    records: 'Shown while something is scheduled in the selected date range.',
    attention: null,
  },
  {
    id: 'warranty',
    kind: 'section',
    label: 'Warranty',
    records: 'Shown while at least one warranty is active.',
    attention: 'Shown only while at least one warranty claim is open.',
  },
  {
    id: 'recent_activity',
    kind: 'section',
    label: 'Recent Activity',
    records: 'Shown once there is client or project activity to list.',
    attention: null,
  },
  {
    id: 'pipeline',
    kind: 'section',
    label: 'Construction Pipeline',
    records: 'Shown once your company has at least one project.',
    attention: null,
  },
] as const satisfies readonly VisibilityItem[]

export type VisibilityItemId = (typeof DASHBOARD_VISIBILITY_ITEMS)[number]['id']
export type ItemVisibility = { enabled: boolean; showWhen: ShowWhen }
export type DashboardVisibility = Record<VisibilityItemId, ItemVisibility>

export const SHOW_WHEN_LABELS: Record<ShowWhen, string> = {
  always: 'Always',
  records: 'When relevant records exist',
  attention: 'When attention is needed',
}

export const ALWAYS_EXPLANATION = 'Shown every time the dashboard loads, including when there is nothing to list.'

const ITEM_BY_ID = new Map<string, VisibilityItem>(DASHBOARD_VISIBILITY_ITEMS.map((i) => [i.id, i]))

/** Built-in defaults reproduce the dashboard as it rendered before these settings existed. */
export function defaultVisibility(): DashboardVisibility {
  return Object.fromEntries(
    DASHBOARD_VISIBILITY_ITEMS.map((i) => [i.id, { enabled: true, showWhen: 'always' }]),
  ) as DashboardVisibility
}

export function supportsAttention(id: VisibilityItemId): boolean {
  return ITEM_BY_ID.get(id)?.attention != null
}

/**
 * Normalizes stored JSON. Unknown keys are dropped, missing or malformed entries fall back to the default, and an
 * attention condition on an item without a reliable rule falls back to "Always" so nothing silently disappears.
 */
export function parseVisibility(raw: unknown): DashboardVisibility {
  const result = defaultVisibility()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result
  for (const item of DASHBOARD_VISIBILITY_ITEMS) {
    const entry = (raw as Record<string, unknown>)[item.id]
    if (!entry || typeof entry !== 'object') continue
    const { enabled, showWhen } = entry as Record<string, unknown>
    const when: ShowWhen =
      showWhen === 'records' || (showWhen === 'attention' && item.attention !== null) ? showWhen : 'always'
    result[item.id] = { enabled: typeof enabled === 'boolean' ? enabled : true, showWhen: when }
  }
  return result
}

export function isDefaultVisibility(v: DashboardVisibility): boolean {
  return DASHBOARD_VISIBILITY_ITEMS.every((i) => v[i.id].enabled && v[i.id].showWhen === 'always')
}

/**
 * Live data signals for one item. `null` means the source could not be read (loading failed or unknown):
 * conditions never hide an item on unknown data, so its error state stays visible instead of looking empty.
 */
export type VisibilitySignal = { records: boolean | null; attention: boolean | null }

export function isItemVisible(setting: ItemVisibility, signal: VisibilitySignal): boolean {
  if (!setting.enabled) return false
  if (setting.showWhen === 'records') return signal.records !== false
  if (setting.showWhen === 'attention') return signal.attention !== false
  return true
}

export function resolveVisibility(
  settings: DashboardVisibility,
  signals: Record<VisibilityItemId, VisibilitySignal>,
): Record<VisibilityItemId, boolean> {
  return Object.fromEntries(
    DASHBOARD_VISIBILITY_ITEMS.map((i) => [i.id, isItemVisible(settings[i.id], signals[i.id])]),
  ) as Record<VisibilityItemId, boolean>
}

/**
 * Card placement. Stored beside the visibility entries under LAYOUT_KEY in the same JSON column, so visibility and
 * placement are always saved together. Positions are order within an area, never pixel coordinates.
 */
export type LayoutArea = 'summary' | 'above' | 'main' | 'side' | 'below'
export type DashboardLayout = Record<LayoutArea, VisibilityItemId[]>
export type DashboardSettings = { visibility: DashboardVisibility; layout: DashboardLayout }

export const LAYOUT_KEY = '_layout'

/** Reading order on every screen size: summary, full-width above, main, side, full-width below. */
export const LAYOUT_AREAS: readonly LayoutArea[] = ['summary', 'above', 'main', 'side', 'below']

export const AREA_LABELS: Record<LayoutArea, string> = {
  summary: 'Summary row',
  above: 'Above main content',
  main: 'Main column',
  side: 'Side column',
  below: 'Below main content',
}

const DEFAULT_LAYOUT: DashboardLayout = {
  summary: ['card_approval', 'card_contract', 'card_schedule', 'card_receivables'],
  above: [],
  main: ['attention', 'priority_jobs'],
  side: ['coming_up', 'warranty', 'recent_activity'],
  below: ['pipeline'],
}

/** Areas each item may occupy. Action Center and Priority Jobs need the main column's width. */
export const ALLOWED_AREAS: Record<VisibilityItemId, readonly LayoutArea[]> = {
  weather: [],
  card_approval: ['summary'],
  card_contract: ['summary'],
  card_schedule: ['summary'],
  card_receivables: ['summary'],
  attention: ['main'],
  priority_jobs: ['main'],
  coming_up: ['main', 'side'],
  warranty: ['main', 'side'],
  recent_activity: ['main', 'side'],
  pipeline: ['above', 'below'],
}

/** Items that take a layout position; header items are toggled but never placed. */
const ITEM_IDS = DASHBOARD_VISIBILITY_ITEMS.filter((i) => i.kind !== 'header').map((i) => i.id) as VisibilityItemId[]
export const HEADER_ITEM_IDS = DASHBOARD_VISIBILITY_ITEMS.filter((i) => i.kind === 'header').map(
  (i) => i.id,
) as VisibilityItemId[]

export function defaultLayout(): DashboardLayout {
  return {
    summary: [...DEFAULT_LAYOUT.summary],
    above: [...DEFAULT_LAYOUT.above],
    main: [...DEFAULT_LAYOUT.main],
    side: [...DEFAULT_LAYOUT.side],
    below: [...DEFAULT_LAYOUT.below],
  }
}

function defaultAreaOf(id: VisibilityItemId): LayoutArea {
  return LAYOUT_AREAS.find((a) => DEFAULT_LAYOUT[a].includes(id)) ?? ALLOWED_AREAS[id][0]
}

/**
 * Normalizes stored placement. Unknown ids, duplicates, and incompatible areas are dropped. Items missing from the
 * stored layout (never saved, or newly introduced) go into their default area right after the nearest default
 * predecessor that is present, so the result is deterministic and every item appears exactly once.
 */
export function parseLayout(raw: unknown): DashboardLayout {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultLayout()
  const result: DashboardLayout = { summary: [], above: [], main: [], side: [], below: [] }
  const seen = new Set<VisibilityItemId>()
  for (const area of LAYOUT_AREAS) {
    const list = (raw as Record<string, unknown>)[area]
    if (!Array.isArray(list)) continue
    for (const id of list) {
      if (typeof id !== 'string' || !ITEM_IDS.includes(id as VisibilityItemId)) continue
      const itemId = id as VisibilityItemId
      if (seen.has(itemId) || !ALLOWED_AREAS[itemId].includes(area)) continue
      seen.add(itemId)
      result[area].push(itemId)
    }
  }
  for (const id of ITEM_IDS) {
    if (seen.has(id)) continue
    const area = defaultAreaOf(id)
    const defaults = DEFAULT_LAYOUT[area]
    const predecessors = defaults.slice(0, defaults.indexOf(id))
    let insertAt = 0
    for (let i = result[area].length - 1; i >= 0; i--) {
      if (predecessors.includes(result[area][i])) {
        insertAt = i + 1
        break
      }
    }
    result[area].splice(insertAt, 0, id)
    seen.add(id)
  }
  return result
}

/**
 * Strict check for a submitted layout: every known item exactly once, each in an allowed area. Returns an error
 * message instead of silently repairing, so an incompatible placement is rejected rather than saved differently.
 */
export function validateLayout(raw: unknown): { layout: DashboardLayout } | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Dashboard layout is missing.' }
  const result: DashboardLayout = { summary: [], above: [], main: [], side: [], below: [] }
  const seen = new Set<string>()
  for (const area of LAYOUT_AREAS) {
    const list = (raw as Record<string, unknown>)[area] ?? []
    if (!Array.isArray(list)) return { error: `${AREA_LABELS[area]} is not a valid list.` }
    for (const id of list) {
      if (typeof id !== 'string' || !ITEM_IDS.includes(id as VisibilityItemId)) return { error: 'Unknown dashboard card.' }
      if (seen.has(id)) return { error: 'A dashboard card appears more than once.' }
      const itemId = id as VisibilityItemId
      if (!ALLOWED_AREAS[itemId].includes(area)) {
        return { error: `${labelOf(itemId)} cannot be placed in the ${AREA_LABELS[area].toLowerCase()}.` }
      }
      seen.add(id)
      result[area].push(itemId)
    }
  }
  if (seen.size !== ITEM_IDS.length) return { error: 'Every dashboard card must have a position.' }
  return { layout: result }
}

export function labelOf(id: VisibilityItemId): string {
  return ITEM_BY_ID.get(id)?.label ?? id
}

export function areaOf(layout: DashboardLayout, id: VisibilityItemId): LayoutArea {
  return LAYOUT_AREAS.find((a) => layout[a].includes(id)) ?? defaultAreaOf(id)
}

/**
 * Places an item at a 1-based position in an area, shifting the others. Out-of-range positions are clamped and an
 * incompatible area leaves the layout unchanged. The result always holds each item exactly once.
 */
export function placeItem(
  layout: DashboardLayout,
  id: VisibilityItemId,
  area: LayoutArea,
  position: number,
): DashboardLayout {
  if (!ALLOWED_AREAS[id].includes(area)) return layout
  const next = Object.fromEntries(LAYOUT_AREAS.map((a) => [a, layout[a].filter((x) => x !== id)])) as DashboardLayout
  const index = Math.min(Math.max(Math.trunc(position) - 1, 0), next[area].length)
  next[area].splice(index, 0, id)
  return next
}

/** Moves an item one position within its area. Returns the same layout at either end. */
export function stepItem(layout: DashboardLayout, id: VisibilityItemId, direction: -1 | 1): DashboardLayout {
  const area = areaOf(layout, id)
  const index = layout[area].indexOf(id)
  const target = index + direction
  if (index === -1 || target < 0 || target >= layout[area].length) return layout
  return placeItem(layout, id, area, target + 1)
}

export function isDefaultLayout(layout: DashboardLayout): boolean {
  return LAYOUT_AREAS.every((a) => layout[a].join(',') === DEFAULT_LAYOUT[a].join(','))
}

export function defaultSettings(): DashboardSettings {
  return { visibility: defaultVisibility(), layout: defaultLayout() }
}

/** Reads the stored column. Organizations without a saved layout keep the original arrangement. */
export function parseDashboardSettings(raw: unknown): DashboardSettings {
  const layoutRaw = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>)[LAYOUT_KEY] : null
  return { visibility: parseVisibility(raw), layout: parseLayout(layoutRaw) }
}

export function isDefaultSettings(s: DashboardSettings): boolean {
  return isDefaultVisibility(s.visibility) && isDefaultLayout(s.layout)
}

/** Stored form: null when everything matches the defaults, so new defaults keep applying. */
export function serializeDashboardSettings(s: DashboardSettings): Record<string, unknown> | null {
  if (isDefaultSettings(s)) return null
  return { ...s.visibility, [LAYOUT_KEY]: s.layout }
}

/** Column classes for the key-figure row so hidden cards never leave holes. */
export function kpiGridClass(count: number): string {
  if (count >= 4) return 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
  if (count === 3) return 'grid gap-4 sm:grid-cols-3'
  if (count === 2) return 'grid gap-4 sm:grid-cols-2'
  return 'grid gap-4'
}
