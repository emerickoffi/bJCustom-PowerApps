import { parseSignedDollarsToCents } from './financials.ts'
import { isOverdue, type SelectionListRow, type SelectionStatus } from './selections.ts'

export const MAX_SELECTIONS_PER_BATCH = 25

/** One entry in the New Selection drawer. Every field is independent per entry. */
export type SelectionDraft = {
  key: string
  name: string
  category: string
  location: string
  due_date: string
  allowance: string
  description: string
  cost_code: string
  notes: string
  internal_notes: string
}

export type DraftField = Exclude<keyof SelectionDraft, 'key'>
export type DraftErrors = Partial<Record<DraftField, string>>

export type ValidDraft = {
  request_key: string
  name: string
  category: string
  location: string | null
  due_date: string | null
  /** null means "no allowance", which is different from a $0.00 allowance. */
  allowance_cents: number | null
  description: string | null
  cost_code: string | null
  notes: string | null
  internal_notes: string | null
}

const LIMITS: Record<DraftField, number> = {
  name: 160,
  category: 60,
  location: 160,
  due_date: 10,
  allowance: 20,
  description: 4000,
  cost_code: 40,
  notes: 4000,
  internal_notes: 4000,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function blankDraft(key: string, carry: Partial<Pick<SelectionDraft, 'category' | 'location'>> = {}): SelectionDraft {
  return {
    key,
    name: '',
    category: carry.category ?? '',
    location: carry.location ?? '',
    due_date: '',
    allowance: '',
    description: '',
    cost_code: '',
    notes: '',
    internal_notes: '',
  }
}

/** True when the entry has anything worth protecting from an accidental close. */
export function isDraftTouched(d: SelectionDraft): boolean {
  return (Object.keys(LIMITS) as DraftField[]).some((f) => d[f].trim() !== '')
}

export function hasMoreDetails(d: SelectionDraft): boolean {
  return [d.description, d.cost_code, d.notes, d.internal_notes].some((v) => v.trim() !== '')
}

function isRealDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v
}

/** Validates one entry. Used by the drawer for instant feedback and by the server as the source of truth. */
export function validateDraft(raw: Partial<SelectionDraft>): { value?: ValidDraft; errors: DraftErrors } {
  const s = (f: DraftField) => (typeof raw[f] === 'string' ? (raw[f] as string).trim() : '')
  const errors: DraftErrors = {}

  for (const f of Object.keys(LIMITS) as DraftField[]) {
    if (s(f).length > LIMITS[f]) errors[f] = `Keep this under ${LIMITS[f]} characters`
  }

  const name = s('name')
  if (name.length < 2) errors.name = 'Enter a name'
  const category = s('category')
  if (category.length < 2) errors.category = 'Choose or add a category'

  const due = s('due_date')
  if (due && !isRealDate(due)) errors.due_date = 'Enter a valid date'

  let allowance_cents: number | null = null
  const allowance = s('allowance')
  if (allowance) {
    const cents = parseSignedDollarsToCents(allowance)
    if (cents === null || cents < 0) errors.allowance = 'Enter a dollar amount of zero or more'
    else allowance_cents = cents
  }

  const key = typeof raw.key === 'string' ? raw.key : ''
  if (!UUID.test(key)) errors.name ??= 'Refresh and try again'

  if (Object.keys(errors).length) return { errors }
  const opt = (f: DraftField) => s(f) || null
  return {
    errors,
    value: {
      request_key: key,
      name,
      category,
      location: opt('location'),
      due_date: due || null,
      allowance_cents,
      description: opt('description'),
      cost_code: opt('cost_code'),
      notes: opt('notes'),
      internal_notes: opt('internal_notes'),
    },
  }
}

// ---------------------------------------------------------------------------
// List filtering
// ---------------------------------------------------------------------------

export const QUICK_FILTERS = ['all', 'needs_decision', 'needs_review', 'approved', 'overdue'] as const
export type QuickFilter = (typeof QUICK_FILTERS)[number]

export const QUICK_FILTER_LABELS: Record<QuickFilter, string> = {
  all: 'All',
  needs_decision: 'Needs decision',
  needs_review: 'Needs review',
  approved: 'Approved',
  overdue: 'Overdue',
}

const REVIEW: ReadonlySet<SelectionStatus> = new Set(['awaiting_builder_review', 'change_order_required'])

export function matchesQuickFilter(row: Pick<SelectionListRow, 'status' | 'due_date'>, filter: QuickFilter, today?: Date): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'needs_decision':
      return row.status === 'awaiting_homeowner'
    case 'needs_review':
      return REVIEW.has(row.status)
    case 'approved':
      return row.status === 'approved'
    case 'overdue':
      return isOverdue(row.due_date, row.status, today)
  }
}

export const SORT_KEYS = ['name', 'location', 'category', 'status', 'due_date', 'allowance_cents'] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

const STATUS_ORDER: Record<SelectionStatus, number> = {
  awaiting_builder_review: 0,
  change_order_required: 1,
  awaiting_homeowner: 2,
  draft: 3,
  approved: 4,
  rejected: 5,
  canceled: 6,
}

/** Sorts a copy. Empty values always sink to the bottom regardless of direction. */
export function sortSelections<T extends SelectionListRow>(rows: readonly T[], key: SortKey, dir: SortDir): T[] {
  const factor = dir === 'asc' ? 1 : -1
  const value = (r: T): string | number | null => {
    if (key === 'status') return STATUS_ORDER[r.status]
    const v = r[key]
    return v === null || v === '' ? null : v
  }
  return [...rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (va === null && vb === null) return a.name.localeCompare(b.name)
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true })
    return cmp === 0 ? a.name.localeCompare(b.name) : cmp * factor
  })
}

export function matchesSearch(row: Pick<SelectionListRow, 'name' | 'category' | 'location'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [row.name, row.category, row.location ?? ''].some((v) => v.toLowerCase().includes(q))
}
