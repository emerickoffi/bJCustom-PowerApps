'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Search } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { formatMoney } from '@/lib/financials'
import {
  CHANGE_ORDER_STATUSES,
  CHANGE_ORDER_STATUS_LABELS,
  changeOrderPath,
  filterAndSortChangeOrders,
  nextChangeOrderAction,
  type DirectoryRow,
  type DirectoryStatusFilter,
} from '@/lib/change-orders'
import { ChangeOrderStatusBadge } from '@/components/change-orders/change-order-status-badge'
import { NativeSelect } from '@/components/shared/form-field'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type OrgChangeOrderRow = DirectoryRow & {
  project_id: string
  project_name: string
  project_number: string | null
  sent_to_homeowner_at: string | null
  decision_at: string | null
}

type ProjectOption = { id: string; name: string; project_number: string | null }

function keyDate(r: OrgChangeOrderRow): { label: string; value: string } {
  if (r.decision_at && (r.status === 'approved' || r.status === 'rejected')) return { label: 'Decided', value: r.decision_at }
  if (r.sent_to_homeowner_at && r.status === 'awaiting_homeowner') return { label: 'Sent', value: r.sent_to_homeowner_at }
  return { label: 'Updated', value: r.updated_at }
}

export function OrgChangeOrderDirectory({ rows, projects }: { rows: OrgChangeOrderRow[]; projects: ProjectOption[] }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<DirectoryStatusFilter>('open')
  const [project, setProject] = useState('all')

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const scoped = rows.filter(
      (r) =>
        (project === 'all' || r.project_id === project) &&
        (!needle ||
          r.title.toLowerCase().includes(needle) ||
          r.co_number.toLowerCase().includes(needle) ||
          r.project_name.toLowerCase().includes(needle) ||
          Boolean(r.project_number?.toLowerCase().includes(needle))),
    )
    return filterAndSortChangeOrders(scoped, '', status, 'updated_desc')
  }, [rows, q, status, project])

  return (
    <section aria-labelledby="org-co-heading" className="flex flex-col gap-3">
      <h2 id="org-co-heading" className="sr-only">
        All change orders
      </h2>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative md:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="org-co-search" className="sr-only">
            Search change orders
          </label>
          <Input
            id="org-co-search"
            type="search"
            placeholder="Search number, title or project"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10 bg-card pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
          <label htmlFor="org-co-status" className="sr-only">
            Filter by status
          </label>
          <NativeSelect id="org-co-status" value={status} onChange={(e) => setStatus(e.target.value as DirectoryStatusFilter)} className="bg-card md:w-44">
            <option value="open">Open (draft or pending)</option>
            <option value="all">All statuses</option>
            {CHANGE_ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CHANGE_ORDER_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
          <label htmlFor="org-co-project" className="sr-only">
            Filter by project
          </label>
          <NativeSelect id="org-co-project" value={project} onChange={(e) => setProject(e.target.value)} className="bg-card md:w-56">
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.project_number ? `${p.project_number} · ${p.name}` : p.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visible.length} of {rows.length} change order{rows.length === 1 ? '' : 's'} shown
      </p>

      {visible.length === 0 ? (
        <div className="surface p-6 text-center text-sm text-muted-foreground">No change orders match these filters.</div>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {visible.map((r) => (
              <li key={r.id}>
                <OrgChangeOrderCard row={r} />
              </li>
            ))}
          </ul>
          <OrgChangeOrderTable rows={visible} />
        </>
      )}
    </section>
  )
}

function ProjectLabel({ row: r }: { row: OrgChangeOrderRow }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-foreground">{r.project_name}</span>
      {r.project_number && <span className="text-xs tabular-nums text-muted-foreground">{r.project_number}</span>}
    </span>
  )
}

function NextAction({ row: r }: { row: OrgChangeOrderRow }) {
  const action = nextChangeOrderAction(r.status)
  if (!action) return <span className="text-muted-foreground">—</span>
  return <span className={cn('text-foreground', r.status === 'awaiting_homeowner' && 'font-medium text-primary')}>{action}</span>
}

function OrgChangeOrderTable({ rows }: { rows: OrgChangeOrderRow[] }) {
  return (
    <div className="surface hidden overflow-x-auto p-0 md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Change orders across projects</caption>
        <thead className="border-b border-border/70 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 lg:px-5">Change order</th>
            <th scope="col" className="px-3 py-3">Project</th>
            <th scope="col" className="px-3 py-3">Status</th>
            <th scope="col" className="px-3 py-3 text-right">Homeowner price</th>
            <th scope="col" className="hidden px-3 py-3 lg:table-cell">Next action</th>
            <th scope="col" className="hidden px-3 py-3 text-right xl:table-cell">Date</th>
            <th scope="col" className="px-4 py-3 text-right lg:px-5">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => {
            const href = changeOrderPath(r.project_id, r.id)
            const date = keyDate(r)
            return (
              <tr key={r.id} className="hover:bg-muted/40">
                <td className="max-w-[18rem] px-4 py-3 lg:px-5">
                  <Link href={href} className="flex min-w-0 flex-col underline-offset-4 hover:underline">
                    <span className="text-xs font-medium tabular-nums text-primary">{r.co_number}</span>
                    <span className="line-clamp-2 text-foreground">{r.title}</span>
                  </Link>
                </td>
                <td className="max-w-[14rem] px-3 py-3">
                  <ProjectLabel row={r} />
                </td>
                <td className="px-3 py-3">
                  <ChangeOrderStatusBadge status={r.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums">
                  <span className={cn(r.price_adjustment_cents < 0 && 'text-primary')}>{formatMoney(r.price_adjustment_cents, { signed: true })}</span>
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <NextAction row={r} />
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-right text-muted-foreground xl:table-cell">
                  <span className="sr-only">{date.label} </span>
                  <span aria-hidden="true" className="mr-1 text-xs">
                    {date.label}
                  </span>
                  {formatDate(date.value)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right lg:px-5">
                  <Link
                    href={href}
                    aria-label={`Open ${r.co_number} in ${r.project_name}`}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sage/70 hover:text-primary"
                  >
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function OrgChangeOrderCard({ row: r }: { row: OrgChangeOrderRow }) {
  const date = keyDate(r)
  return (
    <Link
      href={changeOrderPath(r.project_id, r.id)}
      className="surface flex flex-col gap-3 p-4 transition-colors hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {r.co_number} · {r.project_number ? `${r.project_number} ${r.project_name}` : r.project_name}
          </span>
          <span className="line-clamp-2 font-medium text-foreground">{r.title}</span>
        </div>
        <ChangeOrderStatusBadge status={r.status} className="shrink-0" />
      </div>
      <dl className="grid grid-cols-2 gap-2 border-t border-border/60 pt-3 text-xs">
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">Homeowner price</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatMoney(r.price_adjustment_cents, { signed: true })}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">{date.label}</dt>
          <dd className="tabular-nums text-foreground">{formatDate(date.value)}</dd>
        </div>
        <div className="col-span-2 flex min-w-0 flex-col gap-0.5">
          <dt className="text-muted-foreground">Next action</dt>
          <dd>
            <NextAction row={r} />
          </dd>
        </div>
      </dl>
    </Link>
  )
}
