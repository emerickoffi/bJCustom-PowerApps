'use client'

import { useDeferredValue, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  FolderKanban,
  Mail,
  Phone,
  Search,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NativeSelect } from '@/components/shared/form-field'
import { DIRECTORY_TH_TEXT, DIRECTORY_THEAD_ROW } from '@/lib/directory-table-styles'
import { formatPhone } from '@/lib/format'
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  DIRECTORY_VIEWS,
  PAGE_SIZES,
  buildRows,
  companySummary,
  filterRows,
  paginate,
  personName,
  projectCountLabel,
  sortRows,
  toCsv,
  type CategoryKey,
  type CompanyView,
  type DirectoryRow,
  type DirectoryView,
  type PersonView,
  type ProjectLink,
  type SortDir,
  type SortKey,
  type StatusFilter,
} from '@/lib/contacts'
import { setStatusBulkAction } from '@/app/actions/contacts'
import { InlineEditCell } from '@/components/contacts/inline-edit-cell'
import { ContactStatusBadge } from '@/components/contacts/contact-status-button'

type ColumnKey =
  | 'type'
  | 'company'
  | 'category'
  | 'email'
  | 'phone'
  | 'secondary_phone'
  | 'specialty'
  | 'primary_contact'
  | 'products'
  | 'contacts'
  | 'projects'
  | 'status'

type ColumnDef = { key: ColumnKey; label: string; sort?: SortKey; width?: string }

const COLUMNS: Record<DirectoryView, ColumnDef[]> = {
  all: [
    { key: 'type', label: 'Type', width: 'w-28' },
    { key: 'company', label: 'Company / Contact', sort: 'company' },
    { key: 'category', label: 'Category', sort: 'category' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone', width: 'w-40' },
    { key: 'projects', label: 'Projects', sort: 'projects', width: 'w-32' },
    { key: 'status', label: 'Status', sort: 'status', width: 'w-28' },
  ],
  people: [
    { key: 'company', label: 'Company', sort: 'company' },
    { key: 'category', label: 'Category', sort: 'category' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Primary Phone', width: 'w-40' },
    { key: 'secondary_phone', label: 'Secondary Phone', width: 'w-40' },
    { key: 'specialty', label: 'Specialty' },
    { key: 'projects', label: 'Projects', sort: 'projects', width: 'w-32' },
    { key: 'status', label: 'Status', sort: 'status', width: 'w-28' },
  ],
  companies: [
    { key: 'category', label: 'Category', sort: 'category' },
    { key: 'primary_contact', label: 'Primary Contact' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone', width: 'w-40' },
    { key: 'products', label: 'Product Categories' },
    { key: 'projects', label: 'Assigned Projects', sort: 'projects', width: 'w-36' },
    { key: 'contacts', label: 'Contacts', width: 'w-24' },
    { key: 'status', label: 'Status', sort: 'status', width: 'w-28' },
  ],
}

const DEFAULT_HIDDEN: Record<DirectoryView, ColumnKey[]> = {
  all: [],
  people: ['secondary_phone'],
  companies: ['products'],
}

function rowKey(row: DirectoryRow) {
  return `${row.kind}:${row.id}`
}

function rowHref(row: DirectoryRow) {
  return row.kind === 'person' ? `/contacts/people/${row.id}` : `/contacts/companies/${row.id}`
}

function rowName(row: DirectoryRow) {
  return row.kind === 'person' ? personName(row.person) : row.company.company_name
}

export function ContactsDirectory({
  people,
  companies,
  initialView,
  initialCategory,
}: {
  people: PersonView[]
  companies: CompanyView[]
  initialView: DirectoryView
  initialCategory: CategoryKey | null
}) {
  const router = useRouter()
  const [view, setView] = useState<DirectoryView>(initialView)
  const [category, setCategory] = useState<CategoryKey | null>(initialCategory)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [status, setStatus] = useState<StatusFilter>('active')
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [hidden, setHidden] = useState(DEFAULT_HIDDEN)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [edits, setEdits] = useState<Record<string, Partial<PersonView> & { updated_at: string }>>({})
  const [projectsFor, setProjectsFor] = useState<{ title: string; projects: ProjectLink[] } | null>(null)
  const [confirm, setConfirm] = useState<{ rows: DirectoryRow[]; status: 'active' | 'inactive' } | null>(null)
  const [confirmPending, startConfirm] = useTransition()

  const mergedPeople = useMemo(
    () =>
      people.map((p) => {
        const edit = edits[p.id]
        return edit && edit.updated_at > p.updated_at ? { ...p, ...edit } : p
      }),
    [people, edits],
  )

  const [projectFilter, setProjectFilter] = useState('')
  const projectOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of [...people.flatMap((x) => x.projects), ...companies.flatMap((x) => x.projects)]) {
      if (!map.has(p.project_id)) map.set(p.project_id, p.project_number ? `${p.project_number} · ${p.name}` : p.name)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [people, companies])

  const allRows = useMemo(() => buildRows(view, mergedPeople, companies), [view, mergedPeople, companies])
  const filtered = useMemo(() => {
    const base = filterRows(allRows, { query: deferredQuery, status, category })
    const byProject = projectFilter
      ? base.filter((r) => (r.kind === 'person' ? r.person.projects : r.company.projects).some((p) => p.project_id === projectFilter))
      : base
    return sortRows(byProject, sort.key, sort.dir)
  }, [allRows, deferredQuery, status, category, sort, projectFilter])
  const { items, page: safePage, pages } = paginate(filtered, page, pageSize)
  const columns = COLUMNS[view].filter((c) => !hidden[view].includes(c.key))
  const selectedRows = filtered.filter((r) => selected.has(rowKey(r)))
  const pageKeys = items.map(rowKey)
  const allOnPageSelected = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k))

  const counts = useMemo(() => {
    const base = buildRows(view, mergedPeople, companies)
    const byCat = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<CategoryKey, number>
    let total = 0
    for (const row of filterRows(base, { query: '', status, category: null })) {
      total++
      for (const k of row.kind === 'person' ? row.person.categories : row.company.categories) byCat[k]++
    }
    return { total, byCat }
  }, [view, mergedPeople, companies, status])

  function syncUrl(nextView: DirectoryView, nextCategory: CategoryKey | null) {
    const params = new URLSearchParams()
    if (nextView !== 'all') params.set('view', nextView)
    if (nextCategory) params.set('category', nextCategory)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/contacts?${qs}` : '/contacts')
  }

  function changeView(next: DirectoryView) {
    setView(next)
    setPage(1)
    setSelected(new Set())
    syncUrl(next, category)
  }

  function changeCategory(next: CategoryKey | null) {
    setCategory(next)
    setPage(1)
    syncUrl(view, next)
  }

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'projects' ? 'desc' : 'asc' }))
  }

  function toggleRow(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) pageKeys.forEach((k) => next.delete(k))
      else pageKeys.forEach((k) => next.add(k))
      return next
    })
  }

  function savePersonField(personId: string, field: keyof PersonView, value: string | null, updatedAt: string) {
    setEdits((prev) => ({ ...prev, [personId]: { ...prev[personId], [field]: value, updated_at: updatedAt } }))
  }

  function exportCsv(rows: DirectoryRow[]) {
    if (!rows.length) return toast.error('There are no contacts to export.')
    const csv = toCsv(
      ['Type', 'Name', 'Companies', 'Role', 'Category', 'Email', 'Primary Phone', 'Secondary Phone', 'Specialty', 'Product Categories', 'Projects', 'Status'],
      rows.map((r) =>
        r.kind === 'person'
          ? [
              'Person',
              personName(r.person),
              r.person.companies.map((c) => c.company_name).join('; '),
              r.person.companies.map((c) => c.role).filter(Boolean).join('; '),
              r.person.categories.map((k) => CATEGORY_LABELS[k]).join('; '),
              r.person.email,
              r.person.primary_phone,
              r.person.secondary_phone,
              r.person.specialty,
              '',
              r.person.projects.map((p) => p.name).join('; '),
              r.person.status,
            ]
          : [
              'Company',
              r.company.company_name,
              '',
              '',
              r.company.categories.map((k) => CATEGORY_LABELS[k]).join('; '),
              r.company.company_email,
              r.company.company_phone,
              '',
              '',
              r.company.product_categories.join('; '),
              r.company.projects.map((p) => p.name).join('; '),
              r.company.status,
            ],
      ),
    )
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-${view}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'record' : 'records'}. Notes are not included.`)
  }

  function runConfirm() {
    if (!confirm) return
    startConfirm(async () => {
      const people = confirm.rows.filter((r) => r.kind === 'person').map((r) => r.id)
      const comps = confirm.rows.filter((r) => r.kind === 'company').map((r) => r.id)
      const results = await Promise.all([
        people.length ? setStatusBulkAction('person', people, confirm.status) : null,
        comps.length ? setStatusBulkAction('company', comps, confirm.status) : null,
      ])
      const errors = results.filter((r) => r?.error).map((r) => r!.error!)
      const successes = results.filter((r) => r?.success).map((r) => r!.success!)
      if (successes.length) toast.success(successes.join(' '))
      if (errors.length) toast.error(errors.join(' '))
      setConfirm(null)
      setSelected(new Set())
      router.refresh()
    })
  }

  const hasFilters = Boolean(query || category || status !== 'active' || projectFilter)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Directory view" className="inline-flex w-fit rounded-lg border border-border bg-card p-1 shadow-xs">
          {DIRECTORY_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              role="tab"
              aria-selected={view === v.value}
              onClick={() => changeView(v.value)}
              className={cn(
                'rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                view === v.value ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter by category">
          <CategoryChip active={!category} onClick={() => changeCategory(null)} label="All" count={counts.total} />
          {CATEGORY_KEYS.map((k) => (
            <CategoryChip key={k} active={category === k} onClick={() => changeCategory(category === k ? null : k)} label={CATEGORY_LABELS[k]} count={counts.byCat[k]} />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="contacts-search" className="sr-only">
            Search contacts
          </label>
          <Input
            id="contacts-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
            placeholder="Search names, companies, emails, phones, specialties, projects"
            className="h-10 bg-card pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="contacts-project" className="sr-only">
            Project
          </label>
          <NativeSelect
            id="contacts-project"
            value={projectFilter}
            onChange={(e) => {
              setProjectFilter(e.target.value)
              setPage(1)
            }}
            className="w-48 bg-card"
          >
            <option value="">All projects</option>
            {projectOptions.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </NativeSelect>
          <label htmlFor="contacts-status" className="sr-only">
            Status
          </label>
          <NativeSelect
            id="contacts-status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter)
              setPage(1)
            }}
            className="w-36 bg-card"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All statuses</option>
          </NativeSelect>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="lg" className="hidden bg-card md:inline-flex" />}>
              <Columns3 data-icon="inline-start" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Show columns</DropdownMenuLabel>
                {COLUMNS[view].map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!hidden[view].includes(c.key)}
                    onCheckedChange={(checked) =>
                      setHidden((h) => ({
                        ...h,
                        [view]: checked ? h[view].filter((k) => k !== c.key) : [...h[view], c.key],
                      }))
                    }
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="lg" className="bg-card" onClick={() => exportCsv(filtered)}>
            <Download data-icon="inline-start" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground" aria-live="polite">
          {filtered.length === 0
            ? 'No matching records'
            : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`}
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setStatus('active')
                changeCategory(null)
              }}
              className="ml-2 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <X className="size-3.5" aria-hidden="true" />
              Clear filters
            </button>
          )}
        </p>
        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-sage px-3 py-1.5" role="region" aria-label="Bulk actions">
            <span className="font-medium text-foreground">{selectedRows.length} selected</span>
            <Button size="sm" variant="ghost" onClick={() => exportCsv(selectedRows)}>
              Export selected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ rows: selectedRows, status: 'inactive' })}>
              Deactivate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm({ rows: selectedRows, status: 'active' })}>
              Activate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-input bg-card/70 px-6 py-14 text-center">
          <p className="font-serif text-lg font-semibold text-foreground">No contacts found</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {hasFilters ? 'Try a different search or clear the filters.' : 'Add a contact or import a CSV to build your directory.'}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-border/70 bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow className={DIRECTORY_THEAD_ROW}>
                  <TableHead scope="col" className="w-10 pl-4">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      aria-label="Select all on this page"
                      className="size-4 accent-primary"
                    />
                  </TableHead>
                  <SortHeader label={view === 'companies' ? 'Company' : 'Name'} sortKey="name" sort={sort} onSort={toggleSort} className="min-w-52" />
                  {columns.map((c) =>
                    c.sort ? (
                      <SortHeader key={c.key} label={c.label} sortKey={c.sort} sort={sort} onSort={toggleSort} className={c.width} />
                    ) : (
                      <TableHead key={c.key} scope="col" className={cn(DIRECTORY_TH_TEXT, c.width)}>
                        {c.label}
                      </TableHead>
                    ),
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={rowKey(row)} data-state={selected.has(rowKey(row)) ? 'selected' : undefined} className="hover:bg-[#F4F7F3]">
                    <TableCell className="pl-4">
                      <input
                        type="checkbox"
                        checked={selected.has(rowKey(row))}
                        onChange={() => toggleRow(rowKey(row))}
                        aria-label={`Select ${rowName(row)}`}
                        className="size-4 accent-primary"
                      />
                    </TableCell>
                    <TableCell className="py-3">
                      <NameCell row={row} />
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell key={c.key} className="max-w-64 py-3 align-middle">
                        <Cell
                          column={c.key}
                          row={row}
                          onSaveField={savePersonField}
                          onShowProjects={(title, projects) => setProjectsFor({ title, projects })}
                        />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-2.5 md:hidden">
            {items.map((row) => (
              <MobileCard
                key={rowKey(row)}
                row={row}
                selected={selected.has(rowKey(row))}
                onToggle={() => toggleRow(rowKey(row))}
                onShowProjects={(title, projects) => setProjectsFor({ title, projects })}
              />
            ))}
          </ul>

          <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <label htmlFor="contacts-page-size">Rows per page</label>
              <NativeSelect
                id="contacts-page-size"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                className="h-9 w-20 bg-card"
              >
                {PAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <span className="text-sm tabular-nums text-muted-foreground">
                Page {safePage} of {pages}
              </span>
              <Button variant="outline" size="sm" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </nav>
        </>
      )}

      <Dialog open={Boolean(projectsFor)} onOpenChange={(open) => !open && setProjectsFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{projectsFor?.title}</DialogTitle>
            <DialogDescription>Current project associations.</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
            {projectsFor?.projects.map((p) => (
              <li key={`${p.project_id}-${p.association_id ?? ''}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Link href={`/projects/${p.project_id}`} className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline">
                  {p.name}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {[p.role, p.project_number].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(confirm)} onOpenChange={(open) => !open && !confirmPending && setConfirm(null)}>
        <DialogContent showCloseButton={!confirmPending}>
          <DialogHeader>
            <DialogTitle>
              {confirm?.status === 'inactive' ? 'Deactivate' : 'Activate'} {confirm?.rows.length}{' '}
              {confirm?.rows.length === 1 ? 'record' : 'records'}?
            </DialogTitle>
            <DialogDescription>
              {confirm?.status === 'inactive'
                ? 'Inactive contacts stay in the directory and keep all relationships and history, but cannot be added to new companies or projects. Subcontractor companies are changed from their Subcontractor page.'
                : 'They will be available for new relationships and project associations again.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={confirmPending} onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button variant={confirm?.status === 'inactive' ? 'destructive' : 'default'} disabled={confirmPending} onClick={runConfirm}>
              {confirmPending ? 'Saving...' : confirm?.status === 'inactive' ? 'Deactivate' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground/80 hover:border-primary/40 hover:text-foreground',
      )}
    >
      {label}
      <span className={cn('tabular-nums text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{count}</span>
    </button>
  )
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  sort: { key: SortKey; dir: SortDir }
  onSort: (key: SortKey) => void
  className?: string
}) {
  const active = sort.key === sortKey
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead scope="col" className={cn(DIRECTORY_TH_TEXT, className)} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className="-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
        <Icon className={cn('size-3.5', active ? 'text-foreground' : 'opacity-50')} aria-hidden="true" />
      </button>
    </TableHead>
  )
}

function NameCell({ row }: { row: DirectoryRow }) {
  const isPerson = row.kind === 'person'
  const Icon = isPerson ? User : Building2
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        aria-hidden="true"
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset',
          isPerson ? 'bg-sage text-primary ring-primary/10' : 'bg-[#E6F0FF] text-[#1D5FBD] ring-[#1D5FBD]/10',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-col">
        <Link href={rowHref(row)} className="truncate font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:underline">
          {rowName(row)}
        </Link>
        {row.kind === 'company' && row.company.subcontractor_company_id && (
          <span className="text-xs text-muted-foreground">Linked subcontractor</span>
        )}
      </div>
    </div>
  )
}

function Muted({ children = '—' }: { children?: React.ReactNode }) {
  return <span className="text-sm text-muted-foreground/70">{children}</span>
}

function Categories({ keys }: { keys: CategoryKey[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((k) => (
        <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground/80">
          {CATEGORY_LABELS[k]}
        </span>
      ))}
    </div>
  )
}

function ProjectsButton({ title, projects, onShow }: { title: string; projects: ProjectLink[]; onShow: (title: string, p: ProjectLink[]) => void }) {
  if (!projects.length) return <Muted>Not assigned</Muted>
  return (
    <button
      type="button"
      onClick={() => onShow(title, projects)}
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FolderKanban className="size-3.5" aria-hidden="true" />
      {projectCountLabel(projects.length)}
    </button>
  )
}

function EmailLink({ email }: { email: string | null }) {
  if (!email) return <Muted />
  return (
    <a href={`mailto:${email}`} className="block truncate text-sm text-foreground/85 underline-offset-4 hover:text-primary hover:underline">
      {email}
    </a>
  )
}

function Cell({
  column,
  row,
  onSaveField,
  onShowProjects,
}: {
  column: ColumnKey
  row: DirectoryRow
  onSaveField: (personId: string, field: keyof PersonView, value: string | null, updatedAt: string) => void
  onShowProjects: (title: string, projects: ProjectLink[]) => void
}) {
  if (row.kind === 'person') {
    const p = row.person
    const edit = (field: 'email' | 'primary_phone' | 'secondary_phone' | 'specialty', label: string, type?: 'email' | 'tel') => (
      <InlineEditCell
        personId={p.id}
        field={field}
        label={label}
        type={type}
        value={p[field]}
        updatedAt={p.updated_at}
        display={field.endsWith('phone') ? formatPhone(p[field]) || undefined : undefined}
        onSaved={(value, updatedAt) => onSaveField(p.id, field, value, updatedAt)}
      />
    )
    switch (column) {
      case 'type':
        return <span className="text-sm text-muted-foreground">Person</span>
      case 'company':
        return p.companies.length ? (
          <span className="block truncate text-sm text-foreground/90" title={p.companies.map((c) => c.company_name).join(', ')}>
            {companySummary(p.companies.map((c) => c.company_name))}
          </span>
        ) : (
          <Muted>Independent</Muted>
        )
      case 'category':
        return <Categories keys={p.categories} />
      case 'email':
        return edit('email', 'Email', 'email')
      case 'phone':
        return edit('primary_phone', 'Primary phone', 'tel')
      case 'secondary_phone':
        return edit('secondary_phone', 'Secondary phone', 'tel')
      case 'specialty':
        return edit('specialty', 'Specialty')
      case 'projects':
        return <ProjectsButton title={personName(p)} projects={p.projects} onShow={onShowProjects} />
      case 'status':
        return <ContactStatusBadge status={p.status} />
      default:
        return <Muted />
    }
  }

  const c = row.company
  switch (column) {
    case 'type':
      return <span className="text-sm text-muted-foreground">Company</span>
    case 'company':
    case 'primary_contact':
      return c.primary_contact ? (
        <Link href={`/contacts/people/${c.primary_contact.person_id}`} className="block truncate text-sm text-foreground/90 underline-offset-4 hover:text-primary hover:underline">
          {c.primary_contact.name}
        </Link>
      ) : (
        <Muted>{c.contact_count ? `${c.contact_count} contacts` : 'No contacts'}</Muted>
      )
    case 'category':
      return <Categories keys={c.categories} />
    case 'email':
      return <EmailLink email={c.company_email} />
    case 'phone':
      return c.company_phone ? <span className="text-sm tabular-nums text-foreground/85">{formatPhone(c.company_phone)}</span> : <Muted />
    case 'products':
      return c.product_categories.length ? (
        <span className="block truncate text-sm text-foreground/85" title={c.product_categories.join(', ')}>
          {c.product_categories.join(', ')}
        </span>
      ) : (
        <Muted />
      )
    case 'contacts':
      return <span className="text-sm tabular-nums text-foreground/85">{c.contact_count}</span>
    case 'projects':
      return <ProjectsButton title={c.company_name} projects={c.projects} onShow={onShowProjects} />
    case 'status':
      return <ContactStatusBadge status={c.status} />
    default:
      return <Muted />
  }
}

function MobileCard({
  row,
  selected,
  onToggle,
  onShowProjects,
}: {
  row: DirectoryRow
  selected: boolean
  onToggle: () => void
  onShowProjects: (title: string, projects: ProjectLink[]) => void
}) {
  const isPerson = row.kind === 'person'
  const email = isPerson ? row.person.email : row.company.company_email
  const phone = isPerson ? row.person.primary_phone : row.company.company_phone
  const subtitle = isPerson
    ? [companySummary(row.person.companies.map((c) => c.company_name)).replace('—', 'Independent'), row.person.specialty].filter(Boolean).join(' · ')
    : row.company.primary_contact?.name ?? `${row.company.contact_count} contacts`
  const projects = isPerson ? row.person.projects : row.company.projects
  return (
    <li className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs', selected && 'border-primary/40 ring-1 ring-primary/20')}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`Select ${rowName(row)}`} className="mt-2 size-4 accent-primary" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <NameCell row={row} />
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <ContactStatusBadge status={isPerson ? row.person.status : row.company.status} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-7 text-sm">
        {email && (
          <a href={`mailto:${email}`} className="inline-flex min-w-0 items-center gap-1.5 text-foreground/85 hover:text-primary">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{email}</span>
          </a>
        )}
        {phone && (
          <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-1.5 tabular-nums text-foreground/85 hover:text-primary">
            <Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {formatPhone(phone)}
          </a>
        )}
        <ProjectsButton title={rowName(row)} projects={projects} onShow={onShowProjects} />
      </div>
    </li>
  )
}
