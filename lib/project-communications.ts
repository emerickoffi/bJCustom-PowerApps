import type { ActionEntityType, ActionItem } from './action-items.ts'

export const COMM_TYPES = ['rfi', 'issue', 'client_update', 'quote', 'document', 'daily_log', 'schedule', 'other'] as const
export type CommType = (typeof COMM_TYPES)[number]

export const COMM_TYPE_LABELS: Record<CommType, string> = {
  rfi: 'Question',
  issue: 'Issue',
  client_update: 'Client Update',
  quote: 'Quote',
  document: 'Document',
  daily_log: 'Daily Log',
  schedule: 'Schedule',
  other: 'Other',
}

export type CommView = 'attention' | 'activity'
export const COMM_PAGE_SIZE = 8
export const COMM_MAX_LIMIT = 80

/** One row in the project Communications list. Always points at the record that owns the workflow. */
export type CommunicationItem = {
  /** Stable key: one obligation or one event never appears twice. */
  id: string
  type: CommType
  title: string
  status: string
  /** YYYY-MM-DD or ISO timestamp of the relevant date (due date for actions, event time for activity). */
  date: string | null
  dateLabel: 'Due' | 'Since' | null
  context: string | null
  responsibleUserId: string | null
  responsibleName: string | null
  overdue: boolean
  href: string
  actionLabel: string
}

const ENTITY_TYPE: Partial<Record<ActionEntityType, CommType>> = {
  rfi: 'rfi',
  project_issue: 'issue',
  warranty_claim: 'issue',
  signature_request: 'document',
  estimate: 'document',
  change_order: 'document',
  daily_log: 'daily_log',
  schedule_activity: 'schedule',
}

/** Setup prompts and portfolio checks already live in the Overview's Next Actions; they are not communications. */
const EXCLUDED_ENTITIES = new Set<ActionEntityType>(['project', 'subcontractor', 'invoice'])

export function fromActionItem(item: ActionItem, today: string): CommunicationItem | null {
  if (EXCLUDED_ENTITIES.has(item.entityType)) return null
  return {
    id: item.id,
    type: ENTITY_TYPE[item.entityType] ?? 'other',
    title: item.title,
    status: item.description,
    date: item.dueDate ?? item.createdAt,
    dateLabel: item.dueDate ? 'Due' : item.createdAt ? 'Since' : null,
    context: item.details ?? null,
    responsibleUserId: item.responsibleUserId,
    responsibleName: null,
    overdue: !!item.dueDate && item.dueDate < today,
    href: item.href,
    actionLabel: item.actionLabel,
  }
}

export type ClientUpdateDraft = { id: string; projectId: string; title: string; updatedAt: string; createdBy: string | null }

export function fromClientUpdateDraft(d: ClientUpdateDraft): CommunicationItem {
  return {
    id: `client_update:${d.id}:draft`,
    type: 'client_update',
    title: d.title,
    status: 'Draft awaiting review before homeowners see it',
    date: d.updatedAt,
    dateLabel: 'Since',
    context: null,
    responsibleUserId: d.createdBy,
    responsibleName: null,
    overdue: false,
    href: `/projects/${encodeURIComponent(d.projectId)}/client-updates/${encodeURIComponent(d.id)}`,
    actionLabel: 'Review Update',
  }
}

export type ReceivedQuotes = { requestId: string; projectId: string; title: string; submittedCount: number; latestAt: string }

/** An open request with submitted responses and no award yet. Amounts are never read for this view. */
export function fromReceivedQuotes(q: ReceivedQuotes): CommunicationItem {
  return {
    id: `quote_request:${q.requestId}:received`,
    type: 'quote',
    title: q.title,
    status: q.submittedCount === 1 ? 'New quote received' : `${q.submittedCount} quotes received`,
    date: q.latestAt,
    dateLabel: 'Since',
    context: null,
    responsibleUserId: null,
    responsibleName: null,
    overdue: false,
    href: `/projects/${encodeURIComponent(q.projectId)}/subcontractor-work/quotes/${encodeURIComponent(q.requestId)}`,
    actionLabel: 'Review Quotes',
  }
}

/** Overdue first, then the nearest deadline, then oldest waiting; ties break on the stable id. */
export function compareAttention(a: CommunicationItem, b: CommunicationItem): number {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
  const aDue = a.dateLabel === 'Due', bDue = b.dateLabel === 'Due'
  if (aDue !== bDue) return aDue ? -1 : 1
  const ad = a.date ?? '9999', bd = b.date ?? '9999'
  if (ad !== bd) return ad < bd ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Newest first; ties break on the stable id so pages never reshuffle. */
export function compareActivity(a: CommunicationItem, b: CommunicationItem): number {
  const ad = a.date ?? '', bd = b.date ?? ''
  if (ad !== bd) return ad > bd ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function dedupeById(items: CommunicationItem[]): CommunicationItem[] {
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
}

export type CommFilters = { view: CommView; type: CommType | null; mine: boolean; q: string; limit: number }

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export function isCommType(v: unknown): v is CommType {
  return typeof v === 'string' && (COMM_TYPES as readonly string[]).includes(v)
}

export function parseCommFilters(sp: Record<string, string | string[] | undefined>): CommFilters {
  const type = first(sp.ctype)
  const limit = Number.parseInt(first(sp.cmore) ?? '', 10)
  return {
    view: first(sp.cview) === 'activity' ? 'activity' : 'attention',
    type: isCommType(type) ? type : null,
    mine: first(sp.cmine) === '1',
    q: (first(sp.cq) ?? '').trim().slice(0, 80),
    limit: Number.isFinite(limit) ? Math.min(Math.max(limit, COMM_PAGE_SIZE), COMM_MAX_LIMIT) : COMM_PAGE_SIZE,
  }
}

/** Builds Overview links that keep every other query param (e.g. `work`) intact. */
export function commHref(base: string, current: Record<string, string | string[] | undefined>, next: Partial<CommFilters>) {
  const merged = { ...parseCommFilters(current), ...next }
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(current)) {
    if (k.startsWith('c') && ['cview', 'ctype', 'cmine', 'cq', 'cmore'].includes(k)) continue
    const value = first(v)
    if (value) params.set(k, value)
  }
  if (merged.view === 'activity') params.set('cview', 'activity')
  if (merged.type) params.set('ctype', merged.type)
  if (merged.mine && merged.view === 'attention') params.set('cmine', '1')
  if (merged.q) params.set('cq', merged.q)
  if (merged.limit > COMM_PAGE_SIZE) params.set('cmore', String(merged.limit))
  const qs = params.toString()
  return `${base}${qs ? `?${qs}` : ''}#communications`
}

export function applyCommFilters(items: CommunicationItem[], f: CommFilters, userId: string): CommunicationItem[] {
  const needle = f.q.toLowerCase()
  return items.filter(
    (i) =>
      (!f.type || i.type === f.type) &&
      (!f.mine || f.view !== 'attention' || i.responsibleUserId === userId) &&
      (!needle || `${i.title} ${i.status} ${COMM_TYPE_LABELS[i.type]}`.toLowerCase().includes(needle)),
  )
}
