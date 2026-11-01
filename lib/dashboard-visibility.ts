/**
 * Command Center visibility settings. Presentation only: hiding an item never disables its module, workflows,
 * or permissions, and an item the viewer cannot access stays hidden whatever the setting says.
 */

export type ShowWhen = 'always' | 'records' | 'attention'

export type VisibilityItem = {
  id: string
  kind: 'card' | 'section'
  label: string
  /** What "When relevant records exist" means for this item, in plain language. */
  records: string
  /** What "When attention is needed" means, or null when no reliable rule exists for this item. */
  attention: string | null
}

export const DASHBOARD_VISIBILITY_ITEMS = [
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

/** Column classes for the key-figure row so hidden cards never leave holes. */
export function kpiGridClass(count: number): string {
  if (count >= 4) return 'grid gap-4 sm:grid-cols-2 xl:grid-cols-4'
  if (count === 3) return 'grid gap-4 sm:grid-cols-3'
  if (count === 2) return 'grid gap-4 sm:grid-cols-2'
  return 'grid gap-4'
}
