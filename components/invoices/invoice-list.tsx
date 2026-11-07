'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Receipt } from 'lucide-react'
import type { InvoiceRow } from '@/lib/invoice-queries'
import { DRAW_MILESTONE_LABELS, INVOICE_STATUS_LABELS, balanceCents, isOverdue } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { invoiceDetailHref } from '@/lib/invoice-return'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'
import { DetailList } from '@/components/shared/page-header'
import { PanelSection, RecordPanel, isPlainClick } from '@/components/shared/record-panel'

export type InvoiceListRow = InvoiceRow & { clientName: string }

export function InvoiceList({ invoices, from }: { invoices: InvoiceListRow[]; from: string }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const open = openId ? invoices.find((i) => i.id === openId) ?? null : null

  function openPanel(e: React.MouseEvent, id: string) {
    if (!isPlainClick(e)) return
    e.preventDefault()
    setOpenId(id)
  }

  return (
    <>
      <InvoiceTable invoices={invoices} from={from} onOpen={openPanel} />
      <ul className="flex flex-col divide-y divide-[#D6DDE5] lg:hidden">
        {invoices.map((inv) => (
          <li key={inv.id}>
            <InvoiceCard invoice={inv} from={from} onOpen={openPanel} />
          </li>
        ))}
      </ul>
      <RecordPanel
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        icon={Receipt}
        title={open ? `Invoice ${open.invoice_number}` : 'Invoice'}
        description={open?.title}
        fullHref={open ? invoiceDetailHref(open.id, from) : undefined}
      >
        {open && <InvoiceSummary invoice={open} />}
      </RecordPanel>
    </>
  )
}

function paymentStatus(inv: InvoiceRow) {
  switch (inv.status) {
    case 'draft':
      return 'Not issued yet. Drafts cannot receive payments.'
    case 'issued':
      return inv.paid_cents > 0 ? `${formatCentsExact(inv.paid_cents)} received.` : 'Awaiting payment. Nothing received yet.'
    case 'partially_paid':
      return `${formatCentsExact(inv.paid_cents)} of ${formatCentsExact(inv.total_cents)} received.`
    case 'paid':
      return 'Paid in full.'
    case 'voided':
      return 'Voided. No balance is due.'
    default:
      return INVOICE_STATUS_LABELS[inv.status]
  }
}

function InvoiceSummary({ invoice: inv }: { invoice: InvoiceListRow }) {
  const overdue = isOverdue(inv)
  const draft = inv.status === 'draft'
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <InvoiceStatusBadge status={inv.status} dueDate={inv.due_date} />
        <span className="text-xs text-muted-foreground">
          {inv.invoice_type === 'draw'
            ? `Progress draw${inv.draw_milestone ? ` · ${DRAW_MILESTONE_LABELS[inv.draw_milestone]}` : ''}`
            : 'Standard invoice'}
        </span>
        {!draft && (
          <span className="text-xs text-muted-foreground">{inv.portal_published ? '· Visible in homeowner portal' : '· Not in portal'}</span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
        {[
          { label: 'Total', value: formatCentsExact(inv.total_cents) },
          { label: 'Paid', value: draft ? '—' : formatCentsExact(inv.paid_cents) },
          { label: 'Balance', value: draft ? '—' : formatCentsExact(balanceCents(inv)), strong: true },
        ].map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col gap-0.5 bg-card p-3">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className={cn('truncate tabular-nums', f.strong ? 'font-semibold text-foreground' : 'text-foreground')}>{f.value}</dd>
          </div>
        ))}
      </dl>

      <PanelSection title="Payment status">
        <p className="text-sm text-foreground">{paymentStatus(inv)}</p>
        {overdue && (
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            {`Past due since ${formatDate(inv.due_date)}`}
          </p>
        )}
      </PanelSection>

      <PanelSection title="Summary">
        <DetailList
          items={[
            {
              label: 'Project',
              value: inv.project ? (
                <Link href={`/projects/${inv.project_id}`} className="text-link underline-offset-4 hover:underline">
                  {inv.project.name}
                </Link>
              ) : (
                '—'
              ),
            },
            { label: 'Bill to', value: inv.clientName },
            { label: 'Invoice date', value: formatDate(inv.invoice_date) },
            { label: 'Due date', value: formatDate(inv.due_date) },
            { label: 'Payment terms', value: inv.payment_terms || '—' },
            { label: 'Tax', value: inv.tax_cents ? `${formatCentsExact(inv.tax_cents)} (${inv.tax_percent}%)` : '—' },
          ]}
        />
      </PanelSection>

      <p className="text-xs text-muted-foreground">
        Line items, payments, issuing, and edits are managed in the full invoice workspace.
      </p>
    </>
  )
}

type OpenHandler = (e: React.MouseEvent, id: string) => void

function InvoiceTable({ invoices, from, onOpen }: { invoices: InvoiceListRow[]; from: string; onOpen: OpenHandler }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Invoices</caption>
        <thead>
          <tr className="border-b border-[#D6DDE5] bg-table-head text-left text-xs text-[#526173]">
            <th scope="col" className="px-5 py-3 font-medium">Invoice</th>
            <th scope="col" className="px-4 py-3 font-medium">Project / homeowner</th>
            <th scope="col" className="px-4 py-3 font-medium">Invoice date</th>
            <th scope="col" className="px-4 py-3 font-medium">Due</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Balance</th>
            <th scope="col" className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <tr
              key={inv.id}
              className="border-b border-[#D6DDE5] bg-white transition-colors last:border-0 hover:bg-link-soft/60 has-[:focus-visible]:bg-link-soft/60"
            >
              <td className="px-5 py-3.5">
                <Link
                  href={invoiceDetailHref(inv.id, from)}
                  onClick={(e) => onOpen(e, inv.id)}
                  className="rounded-sm font-medium text-link hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
                >
                  {inv.invoice_number}
                </Link>
                <p className="line-clamp-1 text-xs text-muted-foreground">{inv.title}</p>
              </td>
              <td className="px-4 py-3.5">
                <p className="line-clamp-1">{inv.project?.name ?? '—'}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{inv.clientName}</p>
              </td>
              <td className="whitespace-nowrap px-4 py-3.5 tabular-nums text-muted-foreground">{formatDate(inv.invoice_date)}</td>
              <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">{formatDate(inv.due_date)}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right tabular-nums">{formatCentsExact(inv.total_cents)}</td>
              <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums">
                {inv.status === 'draft' ? '—' : formatCentsExact(balanceCents(inv))}
              </td>
              <td className="px-5 py-3.5">
                <StatusCell invoice={inv} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvoiceCard({ invoice: inv, from, onOpen }: { invoice: InvoiceListRow; from: string; onOpen: OpenHandler }) {
  return (
    <Link
      href={invoiceDetailHref(inv.id, from)}
      onClick={(e) => onOpen(e, inv.id)}
      className="flex flex-col gap-3 p-4 transition-colors hover:bg-link-soft/60 focus-visible:bg-link-soft/60 focus-visible:shadow-[inset_3px_0_0_var(--link)] focus-visible:outline-none md:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-link">{inv.invoice_number}</span>
          <span className="truncate text-sm text-muted-foreground">{inv.title}</span>
        </div>
        <StatusCell invoice={inv} />
      </div>
      <div className="flex min-w-0 flex-col text-sm">
        <span className="truncate text-foreground">{inv.project?.name ?? '—'}</span>
        <span className="truncate text-xs text-muted-foreground">{inv.clientName}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-[#F3F4F6] p-3 text-sm sm:grid-cols-4">
        <CardField label="Invoice date" value={formatDate(inv.invoice_date)} />
        <CardField label="Due" value={formatDate(inv.due_date)} />
        <CardField label="Total" value={formatCentsExact(inv.total_cents)} />
        <CardField label="Balance" value={inv.status === 'draft' ? '—' : formatCentsExact(balanceCents(inv))} strong />
      </dl>
    </Link>
  )
}

function CardField({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate tabular-nums', strong ? 'font-semibold text-foreground' : 'text-foreground')}>{value}</dd>
    </div>
  )
}

function StatusCell({ invoice: inv }: { invoice: InvoiceRow }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 lg:justify-start">
      <InvoiceStatusBadge status={inv.status} dueDate={inv.due_date} />
      {inv.portal_published && inv.status !== 'draft' && <span className="text-xs text-muted-foreground">In portal</span>}
    </div>
  )
}
