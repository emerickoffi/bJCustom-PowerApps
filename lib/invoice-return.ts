const INVOICE_LIST_STATUSES = new Set(['draft', 'issued', 'partially_paid', 'paid', 'voided', 'overdue'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const INVOICE_LIST_HREF = '/invoices'

export type InvoiceReturnTarget = { href: string; label: string }

/**
 * Validates the `from` query value on the invoice detail page. Only known
 * in-app invoice lists are accepted so the param can't become an open redirect.
 */
export function invoiceReturnTarget(from: string | string[] | undefined): InvoiceReturnTarget {
  const fallback = { href: INVOICE_LIST_HREF, label: 'Back to invoices' }
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) return fallback

  let url: URL
  try {
    url = new URL(from, 'http://local')
  } catch {
    return fallback
  }

  if (url.pathname === INVOICE_LIST_HREF) {
    const kept = new URLSearchParams()
    const status = url.searchParams.get('status')
    if (status && INVOICE_LIST_STATUSES.has(status)) kept.set('status', status)
    const q = url.searchParams.get('q')?.trim().slice(0, 100)
    if (q) kept.set('q', q)
    const page = url.searchParams.get('page')
    if (page && /^\d{1,4}$/.test(page) && Number(page) > 1) kept.set('page', page)
    const qs = kept.toString()
    return { href: qs ? `${INVOICE_LIST_HREF}?${qs}` : INVOICE_LIST_HREF, label: 'Back to invoices' }
  }

  const project = url.pathname.match(/^\/projects\/([^/]+)$/)
  if (project && UUID.test(project[1])) {
    return { href: `/projects/${project[1]}#invoices-heading`, label: 'Back to project invoices' }
  }

  return fallback
}

export function invoicePrintHref(invoiceId: string, from?: string) {
  return from ? `/invoices/${invoiceId}/print?from=${encodeURIComponent(from)}` : `/invoices/${invoiceId}/print`
}

export function invoiceDetailHref(invoiceId: string, from?: string) {
  return from ? `/invoices/${invoiceId}?from=${encodeURIComponent(from)}` : `/invoices/${invoiceId}`
}
