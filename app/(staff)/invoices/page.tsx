import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, CircleCheck, FileText, Plus, Receipt, SearchX, Wallet } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { listInvoicesResult, invoiceClientName, type InvoiceRow } from '@/lib/invoice-queries'
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, balanceCents, isOverdue } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { InvoiceStatusBadge } from '@/components/invoices/invoice-status-badge'
import { pillClass } from '@/lib/interaction-styles'
import { invoiceDetailHref } from '@/lib/invoice-return'

export const metadata: Metadata = { title: 'Invoices' }

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await requireStaff()
  const { status } = await searchParams
  const statusFilter = INVOICE_STATUSES.includes(status as never) || status === 'overdue' ? status : undefined
  const { invoices: all, failed } = await listInvoicesResult(session.organizationId)
  const matchesFilter = (inv: InvoiceRow, filter: string | undefined) =>
    !filter ? true : filter === 'overdue' ? isOverdue(inv) : inv.status === filter
  const invoices = all.filter((inv) => matchesFilter(inv, statusFilter))

  const open = all.filter((i) => i.status === 'issued' || i.status === 'partially_paid')
  const outstanding = open.reduce((sum, i) => sum + balanceCents(i), 0)
  const overdue = open.filter(isOverdue)
  const overdueCents = overdue.reduce((sum, i) => sum + balanceCents(i), 0)
  const collected = all.filter((i) => i.status !== 'voided').reduce((sum, i) => sum + i.paid_cents, 0)
  const { canWrite: manager } = await getInvoiceAccess(session)
  const listHref = statusFilter ? `/invoices?status=${statusFilter}` : '/invoices'

  const filters = [
    { value: undefined, label: 'All' },
    ...INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABELS[s] })),
    { value: 'overdue', label: 'Overdue' },
  ].map((f) => ({ ...f, count: all.filter((inv) => matchesFilter(inv, f.value)).length }))

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

      <dl className="grid gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-3">
        <Stat
          icon={Wallet}
          tone="blue"
          label="Outstanding"
          value={formatCentsExact(outstanding)}
          note={`${open.length} open invoice${open.length === 1 ? '' : 's'}`}
        />
        <Stat
          icon={AlertTriangle}
          tone={overdueCents > 0 ? 'danger' : 'amber'}
          label="Overdue"
          value={formatCentsExact(overdueCents)}
          note={overdueCents > 0 ? `${overdue.length} past due` : 'Nothing past due'}
        />
        <Stat
          icon={CircleCheck}
          tone="green"
          label="Collected to date"
          value={formatCentsExact(collected)}
          note="Net of reversals"
          className="sm:col-span-2 lg:col-span-1"
        />
      </dl>

      <section aria-labelledby="invoice-directory" className="surface flex min-w-0 flex-col overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[#D6DDE5] p-4 md:p-5">
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
                    'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm',
                    pillClass(active),
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs tabular-nums',
                      active ? 'bg-white/20 text-primary-foreground' : 'bg-interactive-soft text-foreground/70',
                    )}
                  >
                    {f.count}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>

        {failed ? (
          <EmptyState
            icon={AlertTriangle}
            role="alert"
            title="Invoices couldn't be loaded"
            body="Something went wrong retrieving your invoices. Refresh the page to try again."
          />
        ) : all.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Your first invoice starts here"
            body="Bill a project with a standard invoice or a progress draw tied to a construction milestone. Drafts stay private until you issue them."
            action={
              manager ? (
                <Button render={<Link href="/invoices/new" />} nativeButton={false} className="min-h-11 md:min-h-9">
                  <Plus data-icon="inline-start" />
                  Create First Invoice
                </Button>
              ) : undefined
            }
          />
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={`No ${(filters.find((f) => f.value === statusFilter)?.label ?? '').toLowerCase()} invoices`}
            body="None of your invoices match this status right now."
            action={
              <Button
                variant="outline"
                render={<Link href="/invoices" />}
                nativeButton={false}
                className="min-h-11 md:min-h-9"
              >
                View all invoices
              </Button>
            }
          />
        ) : (
          <>
            <InvoiceTable invoices={invoices} from={listHref} />
            <ul className="flex flex-col divide-y divide-[#D6DDE5] lg:hidden">
              {invoices.map((inv) => (
                <li key={inv.id}>
                  <InvoiceCard invoice={inv} from={listHref} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

const STAT_TONES = {
  blue: 'bg-link-soft text-link ring-link-border',
  amber: 'bg-[#FEF3C7] text-[#92400E] ring-[#92400E]/10',
  green: 'bg-[#DCFCE7] text-[#166534] ring-[#166534]/10',
  danger: 'bg-destructive/10 text-destructive ring-destructive/15',
} as const

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  note,
  className,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>
  tone: keyof typeof STAT_TONES
  label: string
  value: string
  note: string
  className?: string
}) {
  const danger = tone === 'danger'
  return (
    <div className={cn('surface flex items-start justify-between gap-4 p-4 md:p-5', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        <dt className="text-xs font-medium uppercase tracking-wider text-[#526173]">{label}</dt>
        <dd
          className={cn(
            'truncate font-serif text-3xl font-semibold leading-none tracking-tight tabular-nums',
            danger ? 'text-destructive' : 'text-[#17212B]',
          )}
        >
          {value}
        </dd>
        <dd className="text-sm text-[#526173]">{note}</dd>
      </div>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
          STAT_TONES[tone],
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </div>
  )
}

function InvoiceTable({ invoices, from }: { invoices: InvoiceRow[]; from: string }) {
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
                  className="rounded-sm font-medium text-link hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link"
                >
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

function InvoiceCard({ invoice: inv, from }: { invoice: InvoiceRow; from: string }) {
  return (
    <Link
      href={invoiceDetailHref(inv.id, from)}
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
        <span className="truncate text-xs text-muted-foreground">{invoiceClientName(inv)}</span>
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

function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  role,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>
  title: string
  body: string
  action?: React.ReactNode
  role?: 'alert'
}) {
  return (
    <div role={role} className="flex flex-col items-center gap-4 px-6 py-8 text-center md:py-12">
      <span className="flex size-12 items-center justify-center rounded-xl bg-link-soft text-link ring-1 ring-inset ring-link-border">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <h3 className="text-balance font-serif text-xl font-semibold tracking-tight text-[#17212B]">{title}</h3>
        <p className="text-pretty text-sm leading-relaxed text-[#526173]">{body}</p>
      </div>
      {action}
    </div>
  )
}
