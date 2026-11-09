import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, CircleCheck, FileText, Plus, Receipt, SearchX, Wallet } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { listInvoicesResult, invoiceClientName } from '@/lib/invoice-queries'
import { INVOICE_STATUSES, INVOICE_STATUS_LABELS, balanceCents, isOverdue } from '@/lib/invoices'
import {
  invoiceFilterCounts,
  invoiceListHref,
  matchesInvoiceFilter,
  matchesInvoiceSearch,
  paginate,
  parseInvoiceListState,
  type InvoiceListFilter,
  type InvoiceListState,
} from '@/lib/invoice-list-filters'
import { formatCentsExact } from '@/lib/estimates'
import { cn } from '@/lib/utils'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { DirectoryPagination } from '@/components/shared/directory-pagination'
import { worksheetFillerClass, worksheetStripClass, worksheetTabClass } from '@/components/shared/worksheet-tabs'
import { Button } from '@/components/ui/button'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { InvoicesToolbar, RetryButton } from '@/components/invoices/invoices-toolbar'

export const metadata: Metadata = { title: 'Invoices' }

type SearchParams = Promise<{ status?: string; q?: string; page?: string }>

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const state = parseInvoiceListState(await searchParams)
  return (
    <Suspense fallback={<InvoicesLoading />}>
      <InvoicesContent state={state} />
    </Suspense>
  )
}

async function InvoicesContent({ state }: { state: InvoiceListState }) {
  const session = await requireStaff()
  const [{ invoices: raw, failed }, { canWrite: manager }] = await Promise.all([
    listInvoicesResult(session.organizationId),
    getInvoiceAccess(session),
  ])
  const all = raw.map((inv) => ({ ...inv, clientName: invoiceClientName(inv) }))

  const searched = all.filter((inv) => matchesInvoiceSearch(inv, state.q))
  const counts = invoiceFilterCounts(searched)
  const matching = searched.filter((inv) => matchesInvoiceFilter(inv, state.status))
  const { rows, page, pageCount } = paginate(matching, state.page)
  const listHref = invoiceListHref({ status: state.status, q: state.q, page })
  const filtered = !!state.status || !!state.q

  // Summary scope is the whole organization; it intentionally ignores the status tabs and search.
  const open = all.filter((i) => i.status === 'issued' || i.status === 'partially_paid')
  const outstanding = open.reduce((sum, i) => sum + balanceCents(i), 0)
  const overdue = open.filter(isOverdue)
  const overdueCents = overdue.reduce((sum, i) => sum + balanceCents(i), 0)
  const collected = all.filter((i) => i.status !== 'voided').reduce((sum, i) => sum + i.paid_cents, 0)

  const filters: { value?: InvoiceListFilter; label: string; count: number }[] = [
    { value: undefined, label: 'All', count: counts.all },
    ...INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABELS[s], count: counts[s] })),
    { value: 'overdue' as const, label: 'Overdue', count: counts.overdue },
  ]
  const activeLabel = filters.find((f) => f.value === state.status)?.label ?? 'All'

  return (
    <div className={pageLayout('workspace', 'gap-4 md:gap-5')}>
      <PageHeader
        icon={Receipt}
        title="Invoices"
        count={failed ? undefined : { value: all.length, noun: 'invoice' }}
        actions={
          manager ? (
            <Button render={<Link href="/invoices/new" />} nativeButton={false} className="min-h-11 md:min-h-9">
              <Plus data-icon="inline-start" />
              New invoice
            </Button>
          ) : undefined
        }
      />

      {!failed && all.length > 0 && (
        <section aria-labelledby="invoice-summary-heading" className="flex flex-col gap-1.5">
          <h2 id="invoice-summary-heading" className="text-xs text-muted-foreground">
            All projects · USD · not affected by search or status filters
          </h2>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
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
              note={overdue.length > 0 ? `${overdue.length} past due` : 'Nothing past due'}
              href={overdue.length > 0 && state.status !== 'overdue' ? invoiceListHref({ status: 'overdue' }) : undefined}
            />
            <Stat
              icon={CircleCheck}
              tone="green"
              label="Collected to date"
              value={formatCentsExact(collected)}
              note="Net of reversals, incl. partial payments"
            />
          </dl>
        </section>
      )}

      {!failed && all.length > 0 && <InvoicesToolbar status={state.status} query={state.q} />}

      <section aria-labelledby="invoice-results-heading" className="flex min-w-0 flex-col">
        <h2 id="invoice-results-heading" className="sr-only">
          {`${activeLabel} invoices`}
        </h2>
        {!failed && all.length > 0 && (
          <nav aria-label="Filter invoices by status" className={worksheetStripClass}>
            <ul className="flex w-max min-w-full items-end">
              {filters.map((f, index) => {
                const active = state.status === f.value
                return (
                  <li key={f.label} className="flex">
                    <Link
                      href={invoiceListHref({ status: f.value, q: state.q })}
                      scroll={false}
                      aria-current={active ? 'true' : undefined}
                      className={cn(worksheetTabClass(active, index === 0), 'gap-1.5 px-3.5')}
                    >
                      {f.label}
                      <span
                        className={cn(
                          'rounded px-1.5 text-xs tabular-nums',
                          active ? 'bg-sage text-foreground' : 'bg-background/80 text-muted-foreground',
                        )}
                      >
                        {f.count}
                        <span className="sr-only">{f.count === 1 ? ' invoice' : ' invoices'}</span>
                      </span>
                    </Link>
                  </li>
                )
              })}
              <li aria-hidden="true" className={worksheetFillerClass} />
            </ul>
          </nav>
        )}

        <div
          className={cn(
            'flex min-w-0 flex-col overflow-hidden border-border bg-card',
            !failed && all.length > 0 ? 'rounded-b-lg border-x border-b' : 'rounded-lg border',
          )}
        >
          {!failed && all.length > 0 && (
            <p className="border-b border-border px-4 py-2 text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {filtered || pageCount > 1
                ? `Showing ${rows.length} of ${matching.length}${filtered ? ` matching · ${all.length} total` : ''}`
                : `${all.length} invoice${all.length === 1 ? '' : 's'}`}
            </p>
          )}
          {failed ? (
            <ListState
              icon={AlertTriangle}
              role="alert"
              title="Invoices couldn't be loaded"
              body="Something went wrong retrieving your invoices. Nothing was changed."
              action={<RetryButton />}
            />
          ) : all.length === 0 ? (
            <ListState
              icon={FileText}
              title="No invoices yet"
              body="Bill a project with a standard invoice or a progress draw. Drafts stay private until you issue them."
              action={
                manager ? (
                  <Button render={<Link href="/invoices/new" />} nativeButton={false} className="min-h-11 md:min-h-9">
                    <Plus data-icon="inline-start" />
                    Create invoice
                  </Button>
                ) : undefined
              }
            />
          ) : rows.length === 0 ? (
            <ListState
              icon={SearchX}
              title="No invoices match these filters"
              body={[
                state.q && `Nothing matches "${state.q}"`,
                state.status && `${state.q ? 'in' : 'Nothing in'} ${activeLabel}`,
              ]
                .filter(Boolean)
                .join(' ')
                .concat('.')}
              action={
                <Button variant="outline" render={<Link href="/invoices" />} nativeButton={false} className="min-h-11 md:min-h-9">
                  Clear filters
                </Button>
              }
            />
          ) : (
            <InvoiceList invoices={rows} from={listHref} />
          )}
        </div>
        <div className="pt-3 empty:hidden">
          <DirectoryPagination
            page={page}
            pageCount={pageCount}
            label="Invoice pages"
            hrefFor={(p) => invoiceListHref({ status: state.status, q: state.q, page: p })}
          />
        </div>
      </section>
    </div>
  )
}

function InvoicesLoading() {
  return (
    <div className={pageLayout('workspace', 'gap-4 md:gap-5')} role="status" aria-label="Loading invoices">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-[74px] w-full rounded-lg" />
      <Skeleton className="h-9 w-full max-w-md" />
      <div className="flex flex-col gap-px overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-none" />
        ))}
      </div>
    </div>
  )
}

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted', className)} />
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
  href,
}: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: 'true' }>
  tone: keyof typeof STAT_TONES
  label: string
  value: string
  note: string
  href?: string
}) {
  const danger = tone === 'danger'
  const body = (
    <>
      <span
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-md ring-1 ring-inset', STAT_TONES[tone])}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <dt className="text-xs font-medium text-[#526173]">{label}</dt>
        <dd
          className={cn(
            'truncate text-base font-semibold leading-tight tabular-nums',
            danger ? 'text-destructive' : 'text-[#17212B]',
          )}
        >
          {value}
        </dd>
        <dd className="truncate text-xs text-[#526173]">{note}</dd>
      </div>
    </>
  )
  return (
    <div className="flex bg-card">
      {href ? (
        <Link
          href={href}
          scroll={false}
          aria-label={`${label} ${value}, ${note}. Show overdue invoices`}
          className="group flex flex-1 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-link-soft/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          {body}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
        </Link>
      ) : (
        <div className="flex flex-1 items-center gap-3 px-4 py-2.5">{body}</div>
      )}
    </div>
  )
}

function ListState({
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
    <div role={role} className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-lg bg-link-soft text-link ring-1 ring-inset ring-link-border">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <h3 className="text-balance text-base font-semibold text-[#17212B]">{title}</h3>
        <p className="text-pretty text-sm leading-relaxed text-[#526173]">{body}</p>
      </div>
      {action}
    </div>
  )
}
