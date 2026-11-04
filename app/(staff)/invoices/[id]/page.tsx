import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { getInvoice, getInvoiceEvents } from '@/lib/invoice-queries'
import { INVOICE_EVENT_LABELS, balanceCents } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { invoiceReturnTarget } from '@/lib/invoice-return'
import { BackLink, PageHeader } from '@/components/shared/page-header'
import { InvoiceDocument } from '@/components/invoices/invoice-document'
import { InvoiceActions } from '@/components/invoices/invoice-actions'
import { InvoicePayments } from '@/components/invoices/invoice-payments'

export const metadata: Metadata = { title: 'Invoice' }

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string | string[] }>
}) {
  const { id } = await params
  const back = invoiceReturnTarget((await searchParams).from)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await requireStaff()
  const data = await getInvoice(id, session.organizationId)
  if (!data) notFound()
  const { invoice, lines, payments } = data
  const events = await getInvoiceEvents(id)
  const { canWrite: manager } = await getInvoiceAccess(session)

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Breadcrumb" className="-mb-6 print:hidden">
        <BackLink href={back.href} label={back.label} className="min-h-11 px-1 -mx-1 text-link hover:text-link-hover" />
      </nav>
      <PageHeader
        icon={Receipt}
        eyebrow={invoice.project?.name}
        title={`Invoice ${invoice.invoice_number}`}
        description={
          invoice.status === 'draft'
            ? 'Draft — not visible to the homeowner.'
            : invoice.portal_published
              ? 'Shared in the homeowner portal.'
              : 'Issued, but not shared in the homeowner portal.'
        }
      />

      <InvoiceActions
        invoiceId={invoice.id}
        returnHref={back.href}
        status={invoice.status}
        published={invoice.portal_published}
        hasLines={lines.length > 0}
        canManage={manager}
      />

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <InvoiceDocument invoice={invoice} lines={lines} payments={payments} companyName={session.brand.displayName} showReversed />

        <div className="flex flex-col gap-6">
          {invoice.status !== 'draft' && invoice.status !== 'voided' && (
            <InvoicePayments invoiceId={invoice.id} payments={payments} balanceCents={balanceCents(invoice)} canRecord={manager} />
          )}

          <section aria-labelledby="history-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
            <h2 id="history-heading" className="font-serif text-xl">
              History
            </h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <ol className="flex flex-col gap-3 text-sm">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-col border-l-2 border-primary/20 pl-3">
                    <span className="font-medium">
                      {INVOICE_EVENT_LABELS[e.event_type] ?? e.event_type}
                      {e.amount_cents !== null ? ` · ${formatCentsExact(e.amount_cents)}` : ''}
                    </span>
                    {e.details && <span className="text-muted-foreground">{e.details}</span>}
                    <span className="text-xs text-muted-foreground">{formatDate(e.created_at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <p className="text-xs text-muted-foreground">
            Accounting sync: {invoice.accounting_sync_status === 'not_synced' ? 'Not synced' : invoice.accounting_sync_status}.
            QuickBooks sending is not connected yet.
          </p>
        </div>
      </div>
    </div>
  )
}
