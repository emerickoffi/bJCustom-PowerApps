'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { LayoutGrid, List, Search } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/financials'
import {
  CHANGE_ORDER_STATUSES,
  CHANGE_ORDER_STATUS_LABELS,
  changeOrderPath,
  filterAndSortChangeOrders,
  formatScheduleDays,
  isEditableStatus,
  type DirectoryRow,
  type DirectorySort,
  type DirectoryStatusFilter,
} from '@/lib/change-orders'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { NativeSelect } from '@/components/shared/form-field'
import { Input } from '@/components/ui/input'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SORT_OPTIONS: { value: DirectorySort; label: string }[] = [
  { value: 'number_desc', label: 'Newest number' },
  { value: 'number_asc', label: 'Oldest number' },
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'price_desc', label: 'Largest price change' },
  { value: 'price_asc', label: 'Largest credit' },
]

type View = 'list' | 'cards'

export function ChangeOrderDirectory({ projectId, projectName, rows }: { projectId: string; projectName: string; rows: DirectoryRow[] }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<DirectoryStatusFilter>('all')
  const [sort, setSort] = useState<DirectorySort>('number_desc')
  const [view, setView] = useState<View>('list')
  const visible = useMemo(() => filterAndSortChangeOrders(rows, q, status, sort), [rows, q, status, sort])

  return (
    <section aria-labelledby="co-directory-heading" className="flex flex-col gap-3">
      <h2 id="co-directory-heading" className="sr-only">
        Change order directory
      </h2>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="co-search" className="sr-only">
            Search change orders
          </label>
          <Input id="co-search" type="search" placeholder="Search number or title" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 bg-card pl-9" />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
          <label htmlFor="co-status" className="sr-only">
            Filter by status
          </label>
          <NativeSelect id="co-status" value={status} onChange={(e) => setStatus(e.target.value as DirectoryStatusFilter)} className="bg-card md:w-44">
            <option value="all">All statuses</option>
            <option value="open">Open (draft or pending)</option>
            {CHANGE_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CHANGE_ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <label htmlFor="co-sort" className="sr-only">
            Sort
          </label>
          <NativeSelect id="co-sort" value={sort} onChange={(e) => setSort(e.target.value as DirectorySort)} className="bg-card md:w-48">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div role="group" aria-label="View" className="hidden shrink-0 rounded-lg border border-border/80 bg-card p-0.5 md:flex">
          <ViewButton active={view === 'list'} onClick={() => setView('list')} label="List view" icon={List} />
          <ViewButton active={view === 'cards'} onClick={() => setView('cards')} label="Card view" icon={LayoutGrid} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visible.length === rows.length ? `${rows.length} change order${rows.length === 1 ? '' : 's'}` : `${visible.length} of ${rows.length} shown`}
      </p>

      {visible.length === 0 ? (
        <div className="surface p-6 text-center text-sm text-muted-foreground">No change orders match these filters.</div>
      ) : (
        <>
          <ul className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-3', view === 'list' && 'md:hidden')}>
            {visible.map((r) => (
              <li key={r.id}>
                <ChangeOrderCard projectId={projectId} row={r} />
              </li>
            ))}
          </ul>
          {view === 'list' && <ChangeOrderTable projectId={projectId} projectName={projectName} rows={visible} />}
        </>
      )}
    </section>
  )
}

function ViewButton({ active, onClick, label, icon: Icon }: { active: boolean; onClick: () => void; label: string; icon: typeof List }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

function ChangeOrderTable({ projectId, projectName, rows }: { projectId: string; projectName: string; rows: DirectoryRow[] }) {
  return (
    <div className="surface hidden overflow-x-auto p-0 md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Change orders for {projectName}</caption>
        <thead className="border-b border-border/70 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 lg:px-5">Number</th>
            <th scope="col" className="px-3 py-3">Title</th>
            <th scope="col" className="px-3 py-3">Status</th>
            <th scope="col" className="px-3 py-3 text-right">Homeowner price</th>
            <th scope="col" className="px-3 py-3 text-right">Builder cost</th>
            <th scope="col" className="hidden px-3 py-3 text-right lg:table-cell">Schedule</th>
            <th scope="col" className="hidden px-3 py-3 text-right lg:table-cell">Updated</th>
            <th scope="col" className="px-4 py-3 text-right lg:px-5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => {
            const href = changeOrderPath(projectId, r.id)
            return (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums lg:px-5">
                  <Link href={href} className="text-primary underline-offset-4 hover:underline">
                    {r.co_number}
                  </Link>
                </td>
                <td className="max-w-[16rem] px-3 py-3">
                  <Link href={href} className="line-clamp-2 text-foreground underline-offset-4 hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-3 py-3">
                  <ChangeOrderStatusBadge status={r.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                  <SignedMoney cents={r.price_adjustment_cents} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted-foreground">{formatMoney(r.cost_adjustment_cents, { signed: true })}</td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular-nums text-muted-foreground lg:table-cell">{formatScheduleDays(r.schedule_impact_days)}</td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-right text-muted-foreground lg:table-cell">{formatDate(r.updated_at)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right lg:px-5">
                  <div className="flex justify-end gap-1">
                    <Link href={href} className={buttonVariants({ variant: 'ghost', size: 'sm' })} aria-label={`Open ${r.co_number}`}>
                      Open
                    </Link>
                    {isEditableStatus(r.status) && (
                      <Link href={`${href}/edit`} className={buttonVariants({ variant: 'ghost', size: 'sm' })} aria-label={`Edit ${r.co_number}`}>
                        Edit
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ChangeOrderCard({ projectId, row: r }: { projectId: string; row: DirectoryRow }) {
  return (
    <Link
      href={changeOrderPath(projectId, r.id)}
      className="surface flex h-full flex-col gap-3 p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{r.co_number}</span>
          <span className="line-clamp-2 font-medium text-foreground">{r.title}</span>
        </div>
        <ChangeOrderStatusBadge status={r.status} className="shrink-0" />
      </div>
      <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">Price</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            <SignedMoney cents={r.price_adjustment_cents} />
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">Builder cost</dt>
          <dd className="tabular-nums text-foreground">{formatMoney(r.cost_adjustment_cents, { signed: true })}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">Schedule</dt>
          <dd className="tabular-nums text-foreground">{formatScheduleDays(r.schedule_impact_days)}</dd>
        </div>
      </dl>
      <span className="text-xs text-muted-foreground">Updated {formatDate(r.updated_at)}</span>
    </Link>
  )
}

function SignedMoney({ cents }: { cents: number }) {
  return <span className={cn(cents < 0 && 'text-primary')}>{formatMoney(cents, { signed: true })}</span>
}
