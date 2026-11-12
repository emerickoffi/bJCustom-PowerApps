'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowDown, ArrowUp, ImageIcon, LayoutGrid, List, ListChecks, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import { deleteSelectionAction } from '@/app/actions/selections'
import { formatMoney } from '@/lib/financials'
import { formatDate } from '@/lib/format'
import {
  QUICK_FILTERS,
  QUICK_FILTER_LABELS,
  SORT_KEYS,
  matchesQuickFilter,
  matchesSearch,
  sortSelections,
  type QuickFilter,
  type SortDir,
  type SortKey,
} from '@/lib/selection-drafts'
import { STATUS_LABELS, STATUS_TONES, allowanceDelta, isOverdue, selectionPath, type SelectionListRow } from '@/lib/selections'
import { NewSelectionDrawer } from '@/components/selections/new-selection-drawer'
import { PageHeader, PageHeaderIcon, Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type View = 'list' | 'cards'

type Props = {
  projectId: string
  projectName: string
  rows: SelectionListRow[]
  loadError: boolean
  categories: string[]
  thumbnails: Record<string, string>
}

const COLUMNS: { key: SortKey; label: string; className?: string; align?: 'right' }[] = [
  { key: 'name', label: 'Selection' },
  { key: 'location', label: 'Room / location', className: 'hidden md:table-cell' },
  { key: 'category', label: 'Category', className: 'hidden lg:table-cell' },
  { key: 'status', label: 'Status' },
  { key: 'due_date', label: 'Decision due', className: 'hidden sm:table-cell' },
  { key: 'allowance_cents', label: 'Allowance', className: 'hidden md:table-cell', align: 'right' },
]

export function SelectionsWorkspace({ projectId, projectName, rows, loadError, categories, thumbnails }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [view, setView] = useState<View>(params.get('view') === 'cards' ? 'cards' : 'list')
  const [filter, setFilter] = useState<QuickFilter>(() => {
    const f = params.get('filter') as QuickFilter | null
    return f && QUICK_FILTERS.includes(f) ? f : 'all'
  })
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>(() => {
    const k = params.get('sort') as SortKey | null
    return { key: k && SORT_KEYS.includes(k) ? k : 'due_date', dir: params.get('dir') === 'desc' ? 'desc' : 'asc' }
  })
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Old /selections/new links land here with ?new=1; open once, then drop the flag so a refresh doesn't reopen it.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setDrawerOpen(true)
    const next = new URLSearchParams(params)
    next.delete('new')
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }, [params, pathname, router])

  // Mirror view state to the URL without a navigation, so refresh and back keep it.
  useEffect(() => {
    const next = new URLSearchParams()
    if (view !== 'list') next.set('view', view)
    if (filter !== 'all') next.set('filter', filter)
    if (query.trim()) next.set('q', query.trim())
    if (sort.key !== 'due_date') next.set('sort', sort.key)
    if (sort.dir !== 'asc') next.set('dir', sort.dir)
    const url = next.size ? `${pathname}?${next}` : pathname
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url)
  }, [view, filter, query, sort, pathname])

  const counts = useMemo(
    () => ({
      total: rows.length,
      waiting: rows.filter((r) => r.status === 'awaiting_homeowner').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      filters: Object.fromEntries(QUICK_FILTERS.map((f) => [f, rows.filter((r) => matchesQuickFilter(r, f)).length])) as Record<QuickFilter, number>,
    }),
    [rows],
  )

  const visible = useMemo(
    () => sortSelections(rows.filter((r) => matchesQuickFilter(r, filter) && matchesSearch(r, query)), sort.key, sort.dir),
    [rows, filter, query, sort],
  )

  const locations = useMemo(() => [...new Set(rows.map((r) => r.location?.trim()).filter((l): l is string => Boolean(l)))].sort((a, b) => a.localeCompare(b)), [rows])

  const openDrawer = () => setDrawerOpen(true)
  const hasRows = rows.length > 0

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Selections"
        icon={ListChecks}
        meta={
          hasRows ? (
            <>
              <span>
                <span className="font-medium tabular-nums text-foreground">{counts.total}</span> total
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className={cn('font-medium tabular-nums', counts.waiting ? 'text-accent-blue' : 'text-foreground')}>{counts.waiting}</span> awaiting homeowner
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <span className="font-medium tabular-nums text-foreground">{counts.approved}</span> approved
              </span>
            </>
          ) : undefined
        }
        actions={
          hasRows || loadError ? (
            <Button onClick={openDrawer}>
              <Plus className="size-4" aria-hidden="true" />
              New selection
            </Button>
          ) : undefined
        }
      />

      {loadError ? (
        <Surface role="alert">
          <p className="text-sm text-destructive">Selections could not be loaded. Try again shortly.</p>
        </Surface>
      ) : !hasRows ? (
        <EmptyState onCreate={openDrawer} />
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <Toolbar
            filter={filter}
            onFilter={setFilter}
            counts={counts.filters}
            query={query}
            onQuery={setQuery}
            view={view}
            onView={setView}
            sort={sort}
            onSort={setSort}
          />

          {visible.length === 0 ? (
            <Surface className="items-start gap-2">
              <p className="text-sm text-muted-foreground">No selections match these filters.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFilter('all')
                  setQuery('')
                }}
              >
                Clear filters
              </Button>
            </Surface>
          ) : view === 'list' ? (
            <SelectionTable rows={visible} projectId={projectId} sort={sort} onSort={setSort} />
          ) : (
            <SelectionCards rows={visible} projectId={projectId} thumbnails={thumbnails} />
          )}
          <p className="sr-only" aria-live="polite">
            {`Showing ${visible.length} of ${rows.length} selections`}
          </p>
        </div>
      )}

      <NewSelectionDrawer open={drawerOpen} onOpenChange={setDrawerOpen} projectId={projectId} projectName={projectName} categories={categories} locations={locations} />
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Surface className="items-center gap-4 py-10 text-center md:py-12">
      <PageHeaderIcon icon={ListChecks} />
      <div className="flex max-w-md flex-col gap-1">
        <h2 className="type-section-title text-foreground">No selections yet</h2>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Create selections for fixtures, finishes, and other choices your homeowner needs to make.
        </p>
      </div>
      <Button onClick={onCreate}>
        <Plus className="size-4" aria-hidden="true" />
        Create selection
      </Button>
    </Surface>
  )
}

function Toolbar({
  filter,
  onFilter,
  counts,
  query,
  onQuery,
  view,
  onView,
  sort,
  onSort,
}: {
  filter: QuickFilter
  onFilter: (f: QuickFilter) => void
  counts: Record<QuickFilter, number>
  query: string
  onQuery: (q: string) => void
  view: View
  onView: (v: View) => void
  sort: { key: SortKey; dir: SortDir }
  onSort: (s: { key: SortKey; dir: SortDir }) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div role="group" aria-label="Filter selections" className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-0.5">
        {QUICK_FILTERS.map((f) => {
          const active = f === filter
          const n = counts[f]
          if (f !== 'all' && f !== filter && n === 0) return null
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => onFilter(f)}
              className={cn(
                'flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
                !active && f === 'overdue' && 'text-destructive',
              )}
            >
              {QUICK_FILTER_LABELS[f]}
              <span className={cn('tabular-nums text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{n}</span>
            </button>
          )
        })}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search name, room, category" aria-label="Search selections" className="h-9 pl-9 pr-8" />
          {query && (
            <button type="button" onClick={() => onQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {view === 'cards' && (
          <label className="sr-only" htmlFor="sel-card-sort">
            Sort cards
          </label>
        )}
        {view === 'cards' && (
          <select
            id="sel-card-sort"
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':') as [SortKey, SortDir]
              onSort({ key, dir })
            }}
            className="h-9 shrink-0 rounded-lg border border-input bg-card px-2 text-sm"
          >
            <option value="due_date:asc">Due soonest</option>
            <option value="status:asc">Needs action first</option>
            <option value="name:asc">Name A–Z</option>
            <option value="location:asc">Room</option>
            <option value="allowance_cents:desc">Highest allowance</option>
          </select>
        )}
        <div role="group" aria-label="View" className="flex shrink-0 rounded-lg border border-border bg-card p-0.5">
          {(
            [
              ['list', List, 'List view'],
              ['cards', LayoutGrid, 'Card view'],
            ] as const
          ).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              aria-label={label}
              title={label}
              onClick={() => onView(v)}
              className={cn('flex size-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', view === v ? 'bg-sage text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function DueCell({ row }: { row: SelectionListRow }) {
  if (!row.due_date) return <span className="text-muted-foreground">—</span>
  const late = isOverdue(row.due_date, row.status)
  return <span className={late ? 'font-medium text-destructive' : 'text-foreground'}>{late ? `Overdue · ${formatDate(row.due_date)}` : formatDate(row.due_date)}</span>
}

function MoneyCell({ row }: { row: SelectionListRow }) {
  const delta = allowanceDelta(row.allowance_cents, row.selected_price_cents)
  return (
    <span className="flex flex-col items-end tabular-nums">
      <span className={row.allowance_cents === null ? 'text-muted-foreground' : 'text-foreground'}>{row.allowance_cents === null ? 'None' : formatMoney(row.allowance_cents)}</span>
      {delta !== null && delta !== 0 && <span className={cn('text-xs', delta > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground')}>{formatMoney(delta, { signed: true })}</span>}
    </span>
  )
}

function SelectionTable({ rows, projectId, sort, onSort }: { rows: SelectionListRow[]; projectId: string; sort: { key: SortKey; dir: SortDir }; onSort: (s: { key: SortKey; dir: SortDir }) => void }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
          <tr>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('px-4 py-2.5 font-medium', c.key === 'name' ? 'w-auto' : c.key === 'status' ? 'w-40' : 'w-36', c.align === 'right' && 'text-right', c.className)}
                >
                  <button
                    type="button"
                    onClick={() => onSort({ key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
                    className={cn('inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active && 'text-foreground')}
                  >
                    {c.label}
                    {active && (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
                  </button>
                </th>
              )
            })}
            <th scope="col" className="w-12 px-2 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="transition-colors hover:bg-muted/40">
              <td className="px-4 py-3 align-top">
                <Link href={selectionPath(projectId, r.id)} className="break-words font-medium text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {r.name}
                </Link>
                <span className="mt-0.5 block break-words text-xs text-muted-foreground lg:hidden">
                  {[r.location, r.category].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-0.5 block text-xs sm:hidden">
                  <DueCell row={r} />
                </span>
              </td>
              <td className="hidden break-words px-4 py-3 align-top text-foreground md:table-cell">{r.location || <span className="text-muted-foreground">—</span>}</td>
              <td className="hidden break-words px-4 py-3 align-top text-muted-foreground lg:table-cell">{r.category}</td>
              <td className="px-4 py-3 align-top">
                <SemanticBadge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</SemanticBadge>
              </td>
              <td className="hidden px-4 py-3 align-top sm:table-cell">
                <DueCell row={r} />
              </td>
              <td className="hidden px-4 py-3 text-right align-top md:table-cell">
                <MoneyCell row={r} />
              </td>
              <td className="px-2 py-2 align-top">
                <RowMenu row={r} projectId={projectId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RowMenu({ row, projectId }: { row: SelectionListRow; projectId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const href = selectionPath(projectId, row.id)
  const deletable = row.status === 'draft'

  function remove() {
    if (!window.confirm(`Delete the draft “${row.name}”? This can’t be undone.`)) return
    const fd = new FormData()
    fd.set('project_id', projectId)
    fd.set('id', row.id)
    startTransition(async () => {
      const result = await deleteSelectionAction({}, fd)
      if (result?.error) window.alert(result.error)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${row.name}`} disabled={pending} />}>
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => router.push(href)}>Open selection</DropdownMenuItem>
        <DropdownMenuItem onClick={() => router.push(`${href}#options`)}>Manage options</DropdownMenuItem>
        {deletable && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={remove}>
              Delete draft
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SelectionCards({ rows, projectId, thumbnails }: { rows: SelectionListRow[]; projectId: string; thumbnails: Record<string, string> }) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {rows.map((r) => {
        const thumb = thumbnails[r.id]
        const price = r.selected_price_cents ?? r.allowance_cents
        const priceLabel = r.selected_price_cents !== null ? 'Selected' : r.allowance_cents !== null ? 'Allowance' : null
        return (
          <li key={r.id}>
            <Link
              href={selectionPath(projectId, r.id)}
              className="group flex h-full min-w-0 gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {thumb ? (
                  // Signed storage URLs expire, so they bypass the image optimizer cache.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="break-words text-sm font-medium leading-snug text-foreground group-hover:text-primary">{r.name}</span>
                <span className="truncate text-xs text-muted-foreground">{r.location || r.category}</span>
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                  <SemanticBadge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</SemanticBadge>
                  {price !== null && priceLabel && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {priceLabel} <span className="font-medium text-foreground">{formatMoney(price)}</span>
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
