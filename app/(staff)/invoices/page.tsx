import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, CircleCheck, FileText, Plus, Receipt, Wallet } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { listInvoices, invoiceClientName, type InvoiceRow } from '@/lib/invoice-queries'
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, balanceCents, isOverdue } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'

export const metadata: Metadata = { title: 'Invoices' }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireStaff()
  const { status } = await searchParams
  const statusFilter = INVOICE_STATUSES.includes(status as never) || status === 'overdue' ? status : undefined
  const all = await listInvoices(session.organizationId)
  const matchesFilter = (inv: InvoiceRow, filter: string | undefined) =>
    !filter ? true : filter === 'overdue' ? isOverdue(inv) : inv.status === filter
  const invoices = all.filter((inv) => matchesFilter(inv, statusFilter))

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
  ].map((f) => ({ ...f, count: all.filter((inv) => matchesFilter(inv, f.value)).length }))

  return (
    <div className="flex flex-col gap-6 md:gap-8">
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

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          icon={Wallet}
          label="Outstanding"
          value={formatCentsExact(outstanding)}
          note={`${open.length} open invoice${open.length === 1 ? '' : 's'}`}
        />
        <Stat
          icon={AlertTriangle}
          label="Overdue"
          value={formatCentsExact(overdueCents)}
          note={`${overdue.length} past due`}
          danger={overdue.length > 0}
        />
        <Stat
          icon={CircleCheck}
          label="Collected to date"
          value={formatCentsExact(collected)}
          note="Net of reversals"
          className="sm:col-span-2 lg:col-span-1"
        />
      </dl>

      <section aria-labelledby="invoice-directory" className="surface flex min-w-0 flex-col overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[#E2E8E2] p-4 md:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="invoice-directory" className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Invoice directory
            </h2>
            <p className="text-sm tabular-nums text-muted-foreground">
              {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'}
            </p>
          </div>
          <nav aria-label="Filter by status" className="-mx-1 flex flex-wrap gap-1.5">
            {filters.map((f) => {
              const active = statusFilter === f.value
              return (
                <Link
                  key={f.label}
                  href={f.value ? `/invoices?status=${f.value}` : '/invoices'}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-[#E2E8E2] bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      active ? 'bg-white/20 text-primary-foreground' : 'bg-[#EAF0E9] text-foreground/70',
                    )}
                  >
                    {f.count}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        {all.length === 0 ? (
          <FirstInvoiceState manager={manager} />
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-6 py-10 text-center">
            <p className="font-medium text-foreground">No invoices match this filter</p>
            <p className="text-sm text-muted-foreground">Try a different status.</p>
          </div>
        ) : (
          <>
            <InvoiceTable invoices={invoices} />
            <ul className="flex flex-col divide-y divide-[#E2E8E2] lg:hidden">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <InvoiceCard invoice={inv} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  note,
  danger,
  className,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>
  label: string
  value: string
  note: string
  danger?: boolean
  className?: string
}) {
  return (
    <div className={cn('surface flex items-start justify-between gap-4 p-5 md:p-6', className)}>
      <div className="flex min-w-0 flex-col gap-2">
        <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
        <dd
          className={cn(
            'truncate font-serif text-3xl font-semibold leading-none tracking-tight tabular-nums',
            danger ? 'text-destructive' : 'text-foreground',
          )}
        >
          {value}
        </dd>
        <dd className="text-sm text-muted-foreground">{note}</dd>
      </div>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
          danger ? 'bg-destructive/10 text-destructive ring-destructive/15' : 'bg-[#EAF0E9] text-[#174D32] ring-[#174D32]/10',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </div>
  )
}

function InvoiceTable({ invoices }: { invoices: InvoiceRow[] }) {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Invoices</caption>
        <thead>
          <tr className="border-b border-[#E2E8E2] bg-[#F8F7F3] text-left text-xs uppercase tracking-wider text-muted-foreground">
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
            <tr key={inv.id} className="border-b border-[#E2E8E2] transition-colors last:border-0 hover:bg-[#F8F7F3]">
              <td className="px-5 py-3.5">
                <Link href={`/invoices/${inv.id}`} className="font-medium text-foreground hover:text-primary">
                  {inv.invoice_number}
                </Link>
                <p className="line-clamp-1 text-xs text-muted-foreground">{inv.title}</p>
              </td>
              <td className="px-4 py-3.5">
                <p className="line-clamp-1">{inv.project?.name ?? '—'}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{invoiceClientName(inv)}</p>
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

function InvoiceCard({ invoice: inv }: { invoice: InvoiceRow }) {
  return (
    <Link
      href={`/invoices/${inv.id}`}
      className="flex flex-col gap-3 p-4 transition-colors hover:bg-[#F8F7F3] focus-visible:bg-[#F8F7F3] focus-visible:outline-none md:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{inv.invoice_number}</span>
          <span className="truncate text-sm text-muted-foreground">{inv.title}</span>
        </div>
        <StatusCell invoice={inv} />
      </div>
      <div className="flex min-w-0 flex-col text-sm">
        <span className="truncate text-foreground">{inv.project?.name ?? '—'}</span>
        <span className="truncate text-xs text-muted-foreground">{invoiceClientName(inv)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-[#F8F7F3] p-3 text-sm sm:grid-cols-4">
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

function FirstInvoiceState({ manager }: { manager: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-10 text-center md:py-12">
      <span className="flex size-12 items-center justify-center rounded-xl bg-[#EAF0E9] text-[#174D32] ring-1 ring-inset ring-[#174D32]/10">
        <FileText className="size-6" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="font-serif text-xl font-semibold tracking-tight text-foreground">Your first invoice starts here</h3>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Bill a project with a standard invoice or a progress draw tied to a construction milestone. Drafts stay private
          and aren&apos;t shared with homeowners until you issue them.
        </p>
      </div>
      {manager && (
        <Button render={<Link href="/invoices/new" />} nativeButton={false} className="min-h-11 md:min-h-9">
          <Plus data-icon="inline-start" />
          Create First Invoice
        </Button>
      )}
    </div>
  )
}
