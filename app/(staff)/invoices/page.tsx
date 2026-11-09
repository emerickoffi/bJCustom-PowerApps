import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { AlertTriangle, CircleCheck, FileText, Plus, Receipt, SearchX, Wallet } from 'lucide-react'
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
import { APP_CURRENCY, formatCentsExact } from '@/lib/estimates'
import { cn } from '@/lib/utils'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { DirectoryPagination } from '@/components/shared/directory-pagination'
import { SummaryStrip } from '@/components/shared/summary-strip'
import { WorksheetFilters, worksheetResultsClass } from '@/components/shared/worksheet-filters'
import { Button } from '@/components/ui/button'
import { InvoiceList } from '@/components/invoices/invoice-list'
import { InvoicesToolbar, RetryButton } from '@/components/invoices/invoices-toolbar'

export const metadata: Metadata = { title: 'Invoices' }

type SearchParams = Promise<{ status?: string; overdue?: string; q?: string; page?: string }>

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
  const counts = invoiceFilterCounts(searched, { status: state.status, overdue: state.overdue })
  const matching = searched.filter((inv) => matchesInvoiceFilter(inv, state.status, state.overdue))
  const { rows, page, pageCount } = paginate(matching, state.page)
  const listHref = invoiceListHref({ status: state.status, overdue: state.overdue, q: state.q, page })
  const filtered = !!state.status || state.overdue || !!state.q
  const summary =
    rows.length > 0 && (filtered || pageCount > 1)
      ? `Showing ${rows.length} of ${filtered ? `${matching.length} matching · ${all.length} total` : all.length}`
      : undefined

  // Summary scope is the whole organization; it intentionally ignores the status tabs and search.
  const open = all.filter((i) => i.status === 'issued' || i.status === 'partially_paid')
  const outstanding = open.reduce((sum, i) => sum + balanceCents(i), 0)
  const overdue = open.filter(isOverdue)
  const overdueCents = overdue.reduce((sum, i) => sum + balanceCents(i), 0)
  const collected = all.filter((i) => i.status !== 'voided').reduce((sum, i) => sum + i.paid_cents, 0)

  const filters: { value?: InvoiceListFilter; label: string; count: number }[] = [
    { value: undefined, label: 'All', count: counts.all },
    ...INVOICE_STATUSES.map((s) => ({ value: s, label: INVOICE_STATUS_LABELS[s], count: counts[s] })),
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
        <SummaryStrip
          id="invoice-summary-heading"
          scope={`All projects · ${APP_CURRENCY}`}
          helpLabel="About the invoice summary"
          help="These totals always cover every invoice in your organization. They are not affected by search or status filters."
          stats={[
            {
              key: 'outstanding',
              icon: Wallet,
              tone: 'blue',
              label: 'Outstanding',
              value: formatCentsExact(outstanding),
              note: `${open.length} open invoice${open.length === 1 ? '' : 's'}`,
            },
            {
              key: 'overdue',
              icon: AlertTriangle,
              tone: overdueCents > 0 ? 'danger' : 'amber',
              label: 'Overdue',
              value: formatCentsExact(overdueCents),
              note: overdue.length > 0 ? `${overdue.length} past due` : 'Nothing past due',
              href:
                overdue.length > 0 && (!state.overdue || state.status || state.q)
                  ? invoiceListHref({ overdue: true })
                  : undefined,
              hrefLabel: 'Show overdue invoices',
            },
            {
              key: 'collected',
              icon: CircleCheck,
              tone: 'green',
              label: 'Collected to date',
              value: formatCentsExact(collected),
              note: 'Net of reversals, incl. partial payments',
            },
          ]}
        />
      )}

      {!failed && all.length > 0 && (
        <InvoicesToolbar
          status={state.status}
          overdue={state.overdue}
          overdueCount={counts.overdue}
          query={state.q}
          summary={summary}
        />
      )}

      <section aria-labelledby="invoice-results-heading" className="flex min-w-0 flex-col">
        <h2 id="invoice-results-heading" className="sr-only">
          {`${activeLabel}${state.overdue ? ' overdue' : ''} invoices`}
        </h2>
        {!failed && all.length > 0 && (
          <WorksheetFilters
            label="Filter invoices by status"
            noun={{ one: 'invoice', many: 'invoices' }}
            filters={filters.map((f) => ({
              key: f.value ?? 'all',
              label: f.label,
              count: f.count,
              active: state.status === f.value,
              href: invoiceListHref({ status: f.value, overdue: state.overdue, q: state.q }),
            }))}
          />
        )}

        <div className={worksheetResultsClass(!failed && all.length > 0)}>
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
                state.q ? `Nothing matches "${state.q}"` : 'Nothing',
                state.status && `in ${activeLabel}`,
                state.overdue && 'is overdue',
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
            hrefFor={(p) => invoiceListHref({ status: state.status, overdue: state.overdue, q: state.q, page: p })}
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
