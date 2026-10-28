import Link from 'next/link'
import {
  Calculator,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FilePen,
  FileSignature,
  FileText,
  Folders,
  HardHat,
  Ruler,
  ShieldCheck,
  Stamp,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'
import { DOCUMENT_CATEGORIES, categoriesFor, type DocumentCategory, type DocumentScope } from '@/lib/documents'
import { cn } from '@/lib/utils'

export type BrowseParams = {
  q?: string
  category?: string
  visibility?: string
  archived?: string
  page?: string
  project?: string
  tab?: string
}

export type BrowseProjectOption = { id: string; label: string }

export function browseHref(base: string, params: BrowseParams, patch: Partial<BrowseParams>) {
  const merged = { ...params, ...patch }
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(merged)) if (v) search.set(k, v)
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

export function DocumentFiltersForm({
  params,
  showVisibility,
  showArchived,
  scope = 'project',
  projectOptions,
  counts,
  className,
}: {
  params: BrowseParams
  showVisibility: boolean
  showArchived: boolean
  scope?: DocumentScope
  /** When provided, adds a project filter limited to these (already authorized) projects. */
  projectOptions?: BrowseProjectOption[]
  /** Category counts appended to the category options (used where the sidebar is hidden). */
  counts?: Record<string, number> | null
  className?: string
}) {
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null
  return (
    <form role="search" className={cn('flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center', className)}>
      {params.tab && <input type="hidden" name="tab" value={params.tab} />}
      <SearchInput key={params.q} id="q" label="Search documents" defaultValue={params.q ?? ''} placeholder="Search by document name" className="min-w-0 md:min-w-56 md:flex-1" />
      {projectOptions && (
        <>
          <label htmlFor="project" className="sr-only">Project</label>
          <NativeSelect id="project" name="project" defaultValue={params.project ?? ''} className="bg-card lg:w-64">
            <option value="">All accessible projects</option>
            {projectOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </NativeSelect>
        </>
      )}
      <label htmlFor="category" className="sr-only">Category</label>
      <NativeSelect key={`category-${params.category ?? ''}`} id="category" name="category" defaultValue={params.category ?? ''} className="bg-card md:w-52">
        <option value="">{total === null ? 'All categories' : `All categories (${total})`}</option>
        {categoriesFor(scope).map((c) => (
          <option key={c.key} value={c.key}>{counts && c.key in counts ? `${c.label} (${counts[c.key]})` : c.label}</option>
        ))}
      </NativeSelect>
      {showVisibility && (
        <>
          <label htmlFor="visibility" className="sr-only">Visibility</label>
          <NativeSelect key={`visibility-${params.visibility ?? ''}`} id="visibility" name="visibility" defaultValue={params.visibility ?? ''} className="bg-card md:w-48">
            <option value="">Any visibility</option>
            <option value="internal">Internal only</option>
            <option value="homeowner">Shared with homeowner</option>
          </NativeSelect>
        </>
      )}
      {showArchived && params.archived && <input type="hidden" name="archived" value={params.archived} />}
      <Button type="submit" variant="outline" size="lg" className="h-10">Apply</Button>
    </form>
  )
}

const CATEGORY_ICONS: Record<DocumentCategory | '', LucideIcon> = {
  '': Folders,
  floor_plans: Ruler,
  engineering: HardHat,
  permits: Stamp,
  contracts: FileSignature,
  estimates: Calculator,
  change_orders: FilePen,
  construction_reports: ClipboardList,
  photos: Camera,
  warranty: ShieldCheck,
  other: FileText,
}

function CategoryIcon({ category, active }: { category: string; active: boolean }) {
  const Icon = CATEGORY_ICONS[category as DocumentCategory | ''] ?? FileText
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-md',
        active ? 'bg-white text-primary' : 'bg-[#EAF0E9] text-[#174D32]',
      )}
      aria-hidden="true"
    >
      <Icon className="size-3.5" />
    </span>
  )
}

export function CategoryNav({
  base,
  params,
  counts,
}: {
  base: string
  params: BrowseParams
  counts: Record<DocumentCategory, number>
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const items = [{ key: '', label: 'All documents', count: total }, ...DOCUMENT_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: counts[c.key] }))]
  return (
    <nav aria-labelledby="document-library-heading" className="rounded-xl border border-[#E2E8E2] bg-card p-2">
      <h2 id="document-library-heading" className="px-3 pb-2 pt-2 font-serif text-base font-semibold text-foreground">
        Library
      </h2>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active = (params.category ?? '') === item.key
          return (
            <li key={item.key || 'all'} className="shrink-0">
              <Link
                href={browseHref(base, params, { category: item.key || undefined, page: undefined })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-[#EAF0E9] font-medium text-primary' : 'text-muted-foreground hover:bg-[#F8F7F3] hover:text-foreground',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <CategoryIcon category={item.key} active={active} />
                  <span className="whitespace-nowrap lg:whitespace-normal">{item.label}</span>
                </span>
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', active ? 'bg-white text-primary' : 'bg-[#F8F7F3]')}>
                  {item.count}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function DocumentPagination({ base, params, page, pageCount, total }: { base: string; params: BrowseParams; page: number; pageCount: number; total: number }) {
  if (pageCount <= 1) return <p className="text-xs text-muted-foreground">{`${total} document${total === 1 ? '' : 's'}`}</p>
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
      <p className="text-xs text-muted-foreground">{`Page ${page} of ${pageCount} · ${total} documents`}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button variant="outline" size="sm" render={<Link href={browseHref(base, params, { page: String(page - 1) })} />} nativeButton={false}>
            <ChevronLeft data-icon="inline-start" /> Previous
          </Button>
        ) : null}
        {page < pageCount ? (
          <Button variant="outline" size="sm" render={<Link href={browseHref(base, params, { page: String(page + 1) })} />} nativeButton={false}>
            Next <ChevronRight data-icon="inline-end" />
          </Button>
        ) : null}
      </div>
    </nav>
  )
}
