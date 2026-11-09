import { INVOICE_STATUSES, isOverdue, type InvoiceStatus } from './invoices.ts'

export const INVOICE_PAGE_SIZE = 25
export const INVOICE_SEARCH_MAX = 100

/** Lifecycle statuses plus "overdue", a date/balance condition that overlaps issued and partially paid. */
export type InvoiceListFilter = InvoiceStatus | 'overdue'

export type InvoiceListState = { status?: InvoiceListFilter; q: string; page: number }

type FilterableInvoice = {
  status: InvoiceStatus
  due_date: string
  invoice_number: string
  title: string
  project: { name: string; project_number: string | null } | null
  clientName: string
}

export function parseInvoiceListState(params: { status?: unknown; q?: unknown; page?: unknown }): InvoiceListState {
  const status =
    typeof params.status === 'string' &&
    (params.status === 'overdue' || (INVOICE_STATUSES as readonly string[]).includes(params.status))
      ? (params.status as InvoiceListFilter)
      : undefined
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, INVOICE_SEARCH_MAX) : ''
  const pageNum = typeof params.page === 'string' && /^\d{1,4}$/.test(params.page) ? Number(params.page) : 1
  return { status, q, page: Math.max(1, pageNum) }
}

export function invoiceListHref(state: Partial<InvoiceListState>) {
  const params = new URLSearchParams()
  if (state.status) params.set('status', state.status)
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

export function matchesInvoiceFilter(inv: FilterableInvoice, filter: InvoiceListFilter | undefined) {
  if (!filter) return true
  return filter === 'overdue' ? isOverdue(inv) : inv.status === filter
}

/** Counts per filter over the searched set, independent of the selected status and the current page. */
export function invoiceFilterCounts<T extends FilterableInvoice>(searched: T[]) {
  const counts: Record<'all' | InvoiceListFilter, number> = {
    all: searched.length,
    draft: 0,
    issued: 0,
    partially_paid: 0,
    paid: 0,
    voided: 0,
    overdue: 0,
  }
  for (const inv of searched) {
    counts[inv.status] += 1
    if (isOverdue(inv)) counts.overdue += 1
  }
  return counts
}

export function paginate<T>(rows: T[], page: number, size = INVOICE_PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(page, pageCount)
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pageCount }
}
