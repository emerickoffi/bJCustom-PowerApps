import { INVOICE_STATUSES, isOverdue, type InvoiceStatus } from './invoices.ts'

export const INVOICE_PAGE_SIZE = 25
export const INVOICE_SEARCH_MAX = 100

/** Lifecycle status filter. Overdue is a separate date/balance condition, see `InvoiceListState.overdue`. */
export type InvoiceListFilter = InvoiceStatus

export type InvoiceListState = { status?: InvoiceListFilter; overdue: boolean; q: string; page: number }

type FilterableInvoice = {
  status: InvoiceStatus
  due_date: string
  invoice_number: string
  title: string
  project: { name: string; project_number: string | null } | null
  clientName: string
}

/** Accepts `overdue=1` and the legacy `status=overdue` link shape (mapped to "All" + overdue only). */
export function parseInvoiceListState(params: {
  status?: unknown
  overdue?: unknown
  q?: unknown
  page?: unknown
}): InvoiceListState {
  const status =
    typeof params.status === 'string' && (INVOICE_STATUSES as readonly string[]).includes(params.status)
      ? (params.status as InvoiceListFilter)
      : undefined
  const overdue = params.overdue === '1' || params.status === 'overdue'
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, INVOICE_SEARCH_MAX) : ''
  const pageNum = typeof params.page === 'string' && /^\d{1,4}$/.test(params.page) ? Number(params.page) : 1
  return { status, overdue, q, page: Math.max(1, pageNum) }
}

export function invoiceListHref(state: Partial<InvoiceListState>) {
  const params = new URLSearchParams()
  if (state.status) params.set('status', state.status)
  if (state.overdue) params.set('overdue', '1')
  const q = state.q?.trim()
  if (q) params.set('q', q)
  if (state.page && state.page > 1) params.set('page', String(state.page))
  const qs = params.toString()
  return qs ? `/invoices?${qs}` : '/invoices'
}

export function matchesInvoiceSearch(inv: FilterableInvoice, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [inv.invoice_number, inv.title, inv.project?.name, inv.project?.project_number, inv.clientName].some(
    (field) => typeof field === 'string' && field.toLowerCase().includes(needle),
  )
}

/** Status and overdue combine with AND. Filtering only reads records; it never changes them. */
export function matchesInvoiceFilter(inv: FilterableInvoice, status: InvoiceListFilter | undefined, overdue = false) {
  if (status && inv.status !== status) return false
  if (overdue && !isOverdue(inv)) return false
  return true
}

/**
 * Counts over the full searched set (not the current page). Each status count respects the overdue toggle, and the
 * overdue count respects the selected status, so every number equals what selecting that control would show.
 */
export function invoiceFilterCounts<T extends FilterableInvoice>(
  searched: T[],
  selection: { status?: InvoiceListFilter; overdue?: boolean } = {},
) {
  const counts: Record<'all' | InvoiceListFilter | 'overdue', number> = {
    all: 0,
    draft: 0,
    issued: 0,
    partially_paid: 0,
    paid: 0,
    voided: 0,
    overdue: 0,
  }
  for (const inv of searched) {
    const late = isOverdue(inv)
    if (!selection.overdue || late) {
      counts.all += 1
      counts[inv.status] += 1
    }
    if (late && (!selection.status || inv.status === selection.status)) counts.overdue += 1
  }
  return counts
}

export function paginate<T>(rows: T[], page: number, size = INVOICE_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, pageCount)
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pageCount }
}
