import { ACTIVITY_STATUS_LABELS, EVENT_FIELD_LABELS, type ActivityStatus } from './schedule.ts'

export const HISTORY_PAGE_SIZE = 20
export const RECENT_HISTORY_LIMIT = 5
export const EXPORT_BATCH_SIZE = 1000
export const DEFAULT_EXPORT_LIMIT = 10_000
export const HISTORY_EVENT_COLUMNS = 'id, activity_name, event_type, actor_id, changes, created_at'

export type HistoryChange = { from: unknown; to: unknown }

export type HistoryEventRow = {
  id: string
  activity_name: string
  event_type: 'created' | 'updated' | 'deleted'
  actor_id: string | null
  changes: Record<string, HistoryChange> | null
  created_at: string
}

/**
 * Event categories derived from what the `schedule_activity_events` trigger actually records:
 * created / deleted rows, and updated rows whose `changes` keys are the tracked columns.
 */
export const HISTORY_CATEGORIES = {
  created: { label: 'Activity Created', eventType: 'created', fields: [] },
  progress: { label: 'Progress Updated', eventType: 'updated', fields: ['percent_complete'] },
  status: { label: 'Status Changed', eventType: 'updated', fields: ['status'] },
  planned_dates: { label: 'Planned Date Changed', eventType: 'updated', fields: ['planned_start', 'planned_end'] },
  actual_dates: { label: 'Actual Date Changed', eventType: 'updated', fields: ['actual_start', 'actual_end'] },
  assignment: { label: 'Assignment Changed', eventType: 'updated', fields: ['assigned_to'] },
  details: {
    label: 'Details Updated',
    eventType: 'updated',
    fields: ['name', 'phase', 'activity_type', 'weight', 'delay_reason', 'public_note', 'is_published', 'internal_notes'],
  },
  deleted: { label: 'Activity Deleted', eventType: 'deleted', fields: [] },
} as const satisfies Record<string, { label: string; eventType: HistoryEventRow['event_type']; fields: readonly string[] }>

export type HistoryCategory = keyof typeof HISTORY_CATEGORIES
export const HISTORY_CATEGORY_KEYS = Object.keys(HISTORY_CATEGORIES) as HistoryCategory[]

/** Free-text fields whose contents are never shown in history or exports, only that they changed. */
const TEXT_ONLY_FIELDS = new Set(['internal_notes', 'public_note', 'delay_reason'])

export function categoriesFor(event: Pick<HistoryEventRow, 'event_type' | 'changes'>): HistoryCategory[] {
  if (event.event_type === 'created') return ['created']
  if (event.event_type === 'deleted') return ['deleted']
  const keys = Object.keys(event.changes ?? {})
  return HISTORY_CATEGORY_KEYS.filter((c) => {
    const fields = HISTORY_CATEGORIES[c].fields as readonly string[]
    return fields.some((f) => keys.includes(f))
  })
}

// ---------- Filters ----------

export type HistoryFilters = {
  q: string
  type: HistoryCategory | null
  from: string | null
  to: string | null
  actor: string | null
}

export const EMPTY_FILTERS: HistoryFilters = { q: '', type: null, from: null, to: null, actor: null }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SYSTEM_ACTOR = 'system'

function isRealDate(value: string) {
  if (!DATE_RE.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

export type ParsedFilters = { ok: true; filters: HistoryFilters } | { ok: false; error: string }

export function parseHistoryFilters(params: URLSearchParams): ParsedFilters {
  const q = (params.get('q') ?? '').replace(/[\u0000-\u001f]/g, ' ').trim()
  if (q.length > 100) return { ok: false, error: 'Search text must be 100 characters or fewer.' }

  const rawType = params.get('type')
  if (rawType && !(rawType in HISTORY_CATEGORIES)) return { ok: false, error: 'Unknown event type.' }

  const from = params.get('from') || null
  const to = params.get('to') || null
  if (from && !isRealDate(from)) return { ok: false, error: 'Start date is invalid.' }
  if (to && !isRealDate(to)) return { ok: false, error: 'End date is invalid.' }
  if (from && to && from > to) return { ok: false, error: 'Start date must be on or before the end date.' }

  const actor = params.get('actor') || null
  if (actor && actor !== SYSTEM_ACTOR && !UUID_RE.test(actor)) return { ok: false, error: 'Unknown team member.' }

  return { ok: true, filters: { q, type: (rawType as HistoryCategory) || null, from, to, actor } }
}

export function parsePage(value: string | null): number | null {
  if (value === null || value === '') return 1
  if (!/^\d{1,5}$/.test(value)) return null
  const n = Number(value)
  return n >= 1 ? n : null
}

export function hasActiveFilters(f: HistoryFilters) {
  return Boolean(f.q || f.type || f.from || f.to || f.actor)
}

export function filtersToParams(f: HistoryFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.type) p.set('type', f.type)
  if (f.from) p.set('from', f.from)
  if (f.to) p.set('to', f.to)
  if (f.actor) p.set('actor', f.actor)
  return p
}

/** Escapes LIKE wildcards so user search text matches literally. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function describeFilters(f: HistoryFilters, actorName: (id: string) => string): string {
  const parts: string[] = []
  if (f.q) parts.push(`Search: "${f.q}"`)
  if (f.type) parts.push(`Event type: ${HISTORY_CATEGORIES[f.type].label}`)
  if (f.from || f.to) parts.push(`Dates: ${f.from ?? 'earliest'} to ${f.to ?? 'latest'}`)
  if (f.actor) parts.push(`Changed by: ${f.actor === SYSTEM_ACTOR ? 'System' : actorName(f.actor)}`)
  return parts.length ? parts.join('; ') : 'None'
}

// ---------- Time zones ----------

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') }
}

function offsetMs(date: Date, timeZone: string) {
  const p = zoneParts(date, timeZone)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

/** UTC instant of local midnight for a calendar date in the given IANA time zone (DST-aware). */
export function zonedMidnightUtc(date: string, timeZone: string): string {
  const guess = Date.parse(`${date}T00:00:00Z`)
  const first = offsetMs(new Date(guess), timeZone)
  let instant = guess - first
  const second = offsetMs(new Date(instant), timeZone)
  if (second !== first) instant = guess - second
  return new Date(instant).toISOString()
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function todayInZone(timeZone: string, now = new Date()) {
  const p = zoneParts(now, timeZone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Wall-clock parts in the zone, packed into a UTC Date so spreadsheets show the zone's local time. */
export function wallClockDate(iso: string, timeZone: string) {
  const p = zoneParts(new Date(iso), timeZone)
  return new Date(Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second))
}

export function formatInZone(iso: string, timeZone: string) {
  const d = new Date(iso)
  return {
    date: new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' }).format(d),
    time: new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(d),
    zoneName: new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? timeZone,
  }
}

// ---------- Presentation ----------

export type PresentedChange = { field: string; label: string; from: string; to: string; textOnly: boolean }

export type PresentedEvent = {
  id: string
  activityName: string
  eventType: HistoryEventRow['event_type']
  categories: { key: HistoryCategory; label: string }[]
  action: string
  actorName: string
  createdAt: string
  dateLabel: string
  timeLabel: string
  changes: PresentedChange[]
}

type NameFor = (id: string | null) => string | null

function formatCalendarDate(value: string) {
  if (!DATE_RE.test(value)) return value
  const [y, m, d] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

export function formatChangeValue(field: string, value: unknown, nameFor: NameFor): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'status') return ACTIVITY_STATUS_LABELS[value as ActivityStatus] ?? String(value)
  if (field === 'assigned_to') return nameFor(String(value)) ?? '—'
  if (field === 'percent_complete') return `${Math.round(Number(value))}%`
  if (field === 'is_published') return value ? 'Yes' : 'No'
  if (field.endsWith('_start') || field.endsWith('_end')) return formatCalendarDate(String(value))
  return String(value)
}

export function presentEvent(event: HistoryEventRow, nameFor: NameFor, timeZone: string): PresentedEvent {
  const categories = categoriesFor(event).map((key) => ({ key, label: HISTORY_CATEGORIES[key].label }))
  const changes: PresentedChange[] = Object.entries(event.changes ?? {}).map(([field, change]) => {
    const textOnly = TEXT_ONLY_FIELDS.has(field)
    return {
      field,
      label: EVENT_FIELD_LABELS[field] ?? field,
      from: textOnly ? '' : formatChangeValue(field, change?.from, nameFor),
      to: textOnly ? '' : formatChangeValue(field, change?.to, nameFor),
      textOnly,
    }
  })
  const action =
    event.event_type === 'created'
      ? `Added ${event.activity_name} to the schedule`
      : event.event_type === 'deleted'
        ? `Removed ${event.activity_name} from the schedule`
        : changes.length
          ? changes.map((c) => (c.textOnly ? `${c.label} updated` : `${c.label}: ${c.from} → ${c.to}`)).join('; ')
          : `Updated ${event.activity_name}`
  const { date, time } = formatInZone(event.created_at, timeZone)
  return {
    id: event.id,
    activityName: event.activity_name,
    eventType: event.event_type,
    categories,
    action,
    actorName: event.actor_id ? (nameFor(event.actor_id) ?? 'Former team member') : 'System',
    createdAt: event.created_at,
    dateLabel: date,
    timeLabel: time,
    changes,
  }
}

// ---------- Export safety ----------

const EXCEL_CELL_LIMIT = 32_000

/** Neutralises spreadsheet formula injection and keeps text inside Excel's per-cell limit. */
export function safeCellText(value: string): string {
  let text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  if (/^[=+\-@\t\r|%]/.test(text)) text = `'${text}`
  if (text.length > EXCEL_CELL_LIMIT) text = `${text.slice(0, EXCEL_CELL_LIMIT)}… [truncated]`
  return text
}

function filenameSegment(value: string | null | undefined, fallback: string) {
  const cleaned = (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return cleaned || fallback
}

export function buildExportFilename(project: { project_number: string | null; name: string | null }, date: string) {
  return `${filenameSegment(project.project_number, 'Project')}_${filenameSegment(project.name, 'Schedule')}_Activity-History_${date}.xlsx`
}

export function resolveExportLimit(raw: string | undefined) {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 100 && n <= 100_000 ? n : DEFAULT_EXPORT_LIMIT
}
