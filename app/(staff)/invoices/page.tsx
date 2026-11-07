import type { Metadata } from 'next'
import Link from 'next/link'
import { AlertTriangle, CircleCheck, FileText, Plus, Receipt, SearchX, Wallet } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { listInvoicesResult, invoiceClientName, type InvoiceRow } from '@/lib/invoice-queries'
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, balanceCents, isOverdue } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { pillClass } from '@/lib/interaction-styles'

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
    <div className="flex flex-col gap-5 md:gap-6">
      <PageHeader
        icon={Receipt}
        title="Invoices"
        count={failed ? undefined : { value: all.length, noun: 'invoice' }}
        actions={
          manager ? (
            <Button size="lg" render={<Link href="/invoices/new" />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              New invoice
            </Button>
          ) : undefined
        }
      />

      <dl className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
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
            <h2 id="invoice-directory" className="text-sm font-medium text-foreground">
              Filter by status
            </h2>
            <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
              {statusFilter ? `Showing ${invoices.length} of ${all.length}` : `${invoices.length} shown`}
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
          <InvoiceList invoices={invoices.map((inv) => ({ ...inv, clientName: invoiceClientName(inv) }))} from={listHref} />
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
    <div className={cn('flex items-center justify-between gap-4 bg-card px-4 py-3', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-xs font-medium text-[#526173]">{label}</dt>
        <dd
          className={cn(
            'truncate text-lg font-semibold leading-tight tabular-nums',
            danger ? 'text-destructive' : 'text-[#17212B]',
          )}
        >
          {value}
        </dd>
        <dd className="text-xs text-[#526173]">{note}</dd>
      </div>
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
          STAT_TONES[tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
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
