import { formatCentsExact, formatPercent, formatQuantity } from '@/lib/estimates'
import { formatAddress, formatDate } from '@/lib/format'
import { DRAW_MILESTONE_LABELS, PAYMENT_METHOD_LABELS, balanceCents } from '@/lib/invoices'
import type { InvoiceLine, InvoicePayment, InvoiceRow } from '@/lib/invoice-queries'
import { invoiceClientName } from '@/lib/invoice-queries'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'

type Props = {
  invoice: InvoiceRow
  lines: InvoiceLine[]
  payments: InvoicePayment[]
  companyName: string
  showReversed?: boolean
}

export function InvoiceDocument({ invoice, lines, payments, companyName, showReversed = false }: Props) {
  const billTo = invoice.bill_to
  const clientName = invoiceClientName(invoice)
  const billAddressRaw = billTo ? formatAddress(billTo) : '—'
  const billAddress = billAddressRaw === '—' ? null : billAddressRaw
  const project = invoice.project
  const projectAddressRaw = project ? formatAddress(project) : '—'
  const projectAddress = projectAddressRaw === '—' ? null : projectAddressRaw
  const visiblePayments = payments.filter((p) => showReversed || !p.reversed_at)
  const balance = balanceCents(invoice)

  return (
    <article className="flex flex-col gap-8 rounded-xl border bg-card p-6 text-card-foreground sm:p-10 print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-col gap-6 border-b pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{companyName}</p>
          <h2 className="font-serif text-3xl text-foreground">Invoice {invoice.invoice_number}</h2>
          <p className="text-sm text-muted-foreground">{invoice.title}</p>
          {invoice.invoice_type === 'draw' && invoice.draw_milestone && (
            <p className="text-sm text-muted-foreground">Draw: {DRAW_MILESTONE_LABELS[invoice.draw_milestone]}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <InvoiceStatusBadge status={invoice.status} dueDate={invoice.due_date} />
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Invoice date</dt>
            <dd className="text-right font-medium">{formatDate(invoice.invoice_date)}</dd>
            <dt className="text-muted-foreground">Due date</dt>
            <dd className="text-right font-medium">{formatDate(invoice.due_date)}</dd>
            {invoice.issue_version > 1 && (
              <>
                <dt className="text-muted-foreground">Version</dt>
                <dd className="text-right font-medium">{invoice.issue_version}</dd>
              </>
            )}
          </dl>
        </div>
      </header>

      {invoice.status === 'voided' && (
        <div role="note" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">This invoice was voided on {formatDate(invoice.voided_at)} and is no longer payable.</p>
          {invoice.void_reason && <p className="mt-1">Reason: {invoice.void_reason}</p>}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-1 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Bill to</h3>
          <p className="font-medium text-foreground">{clientName}</p>
          {billTo?.company && <p>{billTo.company}</p>}
          {billAddress && <p className="text-muted-foreground">{billAddress}</p>}
          {billTo?.email && <p className="text-muted-foreground">{billTo.email}</p>}
        </section>
        <section className="flex flex-col gap-1 text-sm">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Project</h3>
          <p className="font-medium text-foreground">
            {project?.name ?? '—'}
            {project?.project_number ? ` · ${project.project_number}` : ''}
          </p>
          {projectAddress && <p className="text-muted-foreground">{projectAddress}</p>}
          {invoice.estimate && (
            <p className="text-muted-foreground">
              Against estimate {invoice.estimate.estimate_number ?? invoice.estimate.name}
            </p>
          )}
        </section>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Invoice line items</caption>
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="py-2 pr-4 font-medium">Description</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Qty</th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">Rate</th>
              <th scope="col" className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted-foreground">No line items yet.</td>
              </tr>
            ) : (
              lines.map((line) => (
                <tr key={line.id} className="border-b border-border/60 align-top">
                  <td className="py-3 pr-4">
                    {line.description}
                    {!line.taxable && invoice.tax_percent > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">(non-taxable)</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatQuantity(line.quantity)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatCentsExact(line.unit_rate_cents)}</td>
                  <td className="py-3 text-right tabular-nums">{formatCentsExact(line.amount_cents)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <dl className="grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-right tabular-nums">{formatCentsExact(invoice.subtotal_cents)}</dd>
          {invoice.tax_percent > 0 && (
            <>
              <dt className="text-muted-foreground">Tax ({formatPercent(invoice.tax_percent)})</dt>
              <dd className="text-right tabular-nums">{formatCentsExact(invoice.tax_cents)}</dd>
            </>
          )}
          <dt className="border-t pt-2 font-medium">Total</dt>
          <dd className="border-t pt-2 text-right font-medium tabular-nums">{formatCentsExact(invoice.total_cents)}</dd>
          {invoice.status !== 'draft' && (
            <>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-right tabular-nums">{formatCentsExact(invoice.paid_cents)}</dd>
              <dt className="border-t pt-2 font-semibold text-foreground">Balance due</dt>
              <dd className="border-t pt-2 text-right font-semibold tabular-nums text-foreground">
                {formatCentsExact(balance)}
              </dd>
            </>
          )}
        </dl>
      </div>

      {visiblePayments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Payments received</h3>
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            {visiblePayments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className={p.reversed_at ? 'text-muted-foreground line-through' : ''}>
                  {formatDate(p.payment_date)} · {PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference ? ` · Ref ${p.reference}` : ''}
                </span>
                <span className={`tabular-nums ${p.reversed_at ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                  {formatCentsExact(p.amount_cents)}
                </span>
                {p.reversed_at && (
                  <span className="w-full text-xs text-destructive">Reversed: {p.reversal_reason}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(invoice.payment_terms || invoice.payment_instructions || invoice.notes) && (
        <footer className="grid gap-6 border-t pt-6 text-sm sm:grid-cols-2">
          {(invoice.payment_terms || invoice.payment_instructions) && (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">How to pay</h3>
              {invoice.payment_terms && <p className="font-medium">{invoice.payment_terms}</p>}
              {invoice.payment_instructions && (
                <p className="whitespace-pre-line text-muted-foreground">{invoice.payment_instructions}</p>
              )}
            </section>
          )}
          {invoice.notes && (
            <section className="flex flex-col gap-1">
              <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Notes</h3>
              <p className="whitespace-pre-line text-muted-foreground">{invoice.notes}</p>
            </section>
          )}
        </footer>
      )}
    </article>
  )
}
