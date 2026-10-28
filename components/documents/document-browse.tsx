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
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/documents'
import { cn } from '@/lib/utils'

export type BrowseParams = { q?: string; category?: string; visibility?: string; archived?: string; page?: string }

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
}: {
  params: BrowseParams
  showVisibility: boolean
  showArchived: boolean
}) {
  return (
    <form role="search" className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <SearchInput key={params.q} id="q" label="Search documents" defaultValue={params.q ?? ''} placeholder="Search by document name" className="flex-1" />
      <label htmlFor="category" className="sr-only">Category</label>
      <NativeSelect id="category" name="category" defaultValue={params.category ?? ''} className="bg-card lg:w-64">
        <option value="">All categories</option>
        {DOCUMENT_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>{c.label}</option>
        ))}
      </NativeSelect>
      {showVisibility && (
        <>
          <label htmlFor="visibility" className="sr-only">Visibility</label>
          <NativeSelect id="visibility" name="visibility" defaultValue={params.visibility ?? ''} className="bg-card lg:w-48">
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
    <nav aria-label="Document categories">
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
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
