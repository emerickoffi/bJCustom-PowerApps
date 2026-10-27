import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Receipt } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { listInvoices, invoiceClientName } from '@/lib/invoice-queries'
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, balanceCents, isOverdue } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'

export const metadata: Metadata = { title: 'Invoices' }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireStaff()
  const { status } = await searchParams
  const statusFilter = INVOICE_STATUSES.includes(status as never) || status === 'overdue' ? status : undefined
  const all = await listInvoices(session.organizationId)
  const invoices = all.filter((inv) =>
    !statusFilter ? true : statusFilter === 'overdue' ? isOverdue(inv) : inv.status === statusFilter,
  )

  const open = all.filter((i) => i.status === 'issued' || i.status === 'partially_paid')
  const outstanding = open.reduce((sum, i) => sum + balanceCents(i), 0)
  const overdue = open.filter(isOverdue)
  const overdueCents = overdue.reduce((sum, i) => sum + balanceCents(i), 0)
  const collected = all.filter((i) => i.status !== 'voided').reduce((sum, i) => sum + i.paid_cents, 0)
  const { canWrite: manager } = await getInvoiceAccess(session)

  const filters = [
    { value: undefined, label: 'All' },
    ...INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABELS[s] })),
    { value: 'overdue', label: 'Overdue' },
  ]

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={Receipt}
        title="Invoices"
        description="Progress draws and invoices for your projects. Payments are recorded manually."
        actions={
          manager ? (
            <Button render={<Link href="/invoices/new" />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              New invoice
            </Button>
          ) : undefined
        }
      />

      <dl className="grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatCentsExact(outstanding)} note={`${open.length} open invoice${open.length === 1 ? '' : 's'}`} />
        <Stat label="Overdue" value={formatCentsExact(overdueCents)} note={`${overdue.length} past due`} danger={overdue.length > 0} />
        <Stat label="Collected to date" value={formatCentsExact(collected)} note="Net of reversals" />
      </dl>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = statusFilter === f.value
          return (
            <Link
              key={f.label}
              href={f.value ? `/invoices?status=${f.value}` : '/invoices'}
              aria-current={active ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </nav>

      {invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={all.length === 0 ? 'No invoices yet' : 'No invoices match this filter'}
          description={
            all.length === 0
              ? 'Create a draft invoice or progress draw for a project. Nothing is shared with homeowners until you issue it.'
              : 'Try a different status.'
          }
        />
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Invoices</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Invoice</th>
                <th scope="col" className="px-4 py-3 font-medium">Project / homeowner</th>
                <th scope="col" className="px-4 py-3 font-medium">Due</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Total</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Balance</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${inv.id}`} className="font-medium text-foreground hover:text-primary">
                      {inv.invoice_number}
                    </Link>
                    <p className="text-xs text-muted-foreground">{inv.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{inv.project?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{invoiceClientName(inv)}</p>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatCentsExact(inv.total_cents)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">
                    {inv.status === 'draft' ? '—' : formatCentsExact(balanceCents(inv))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <InvoiceStatusBadge status={inv.status} dueDate={inv.due_date} />
                      {inv.portal_published && inv.status !== 'draft' && (
                        <span className="text-xs text-muted-foreground">In portal</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, note, danger }: { label: string; value: string; note: string; danger?: boolean }) {
  return (
    <div className="surface flex flex-col gap-1 p-5">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`font-serif text-2xl tabular-nums ${danger ? 'text-destructive' : 'text-foreground'}`}>{value}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}
