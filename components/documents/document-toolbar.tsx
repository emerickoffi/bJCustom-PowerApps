'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Archive, Loader2, Search, X } from 'lucide-react'
import { NativeSelect } from '@/components/shared/form-field'
import { browseHref, type BrowseParams } from '@/components/documents/document-browse'
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/documents'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 300

export function DocumentToolbar({
  base,
  params,
  archived,
  archivedCount,
  counts,
}: {
  base: string
  params: BrowseParams
  archived: boolean
  archivedCount: number | null
  /** Category counts for the narrow-screen category selector; null hides it (archived view). */
  counts: Record<DocumentCategory, number> | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(params.q ?? '')
  const [appliedQ, setAppliedQ] = useState(params.q ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Follow URL changes made elsewhere (e.g. "Clear filters") without clobbering text still being typed.
  if ((params.q ?? '') !== appliedQ) {
    setAppliedQ(params.q ?? '')
    if (!timer.current) setQuery(params.q ?? '')
  }

  function navigate(patch: Partial<BrowseParams>) {
    startTransition(() => {
      router.replace(browseHref(base, params, { ...patch, page: undefined }), { scroll: false })
    })
  }

  function onQueryChange(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const next = value.trim()
      if (next !== (params.q ?? '')) navigate({ q: next || undefined })
    }, SEARCH_DEBOUNCE_MS)
  }

  function clearSearch() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setQuery('')
    if (params.q) navigate({ q: undefined })
  }

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0

  return (
    <div role="search" aria-label="Filter documents" className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
      {counts && (
        <div className="lg:hidden tablet:block">
          <label htmlFor="doc-category" className="sr-only">Category</label>
          <NativeSelect
            id="doc-category"
            value={params.category ?? ''}
            onChange={(e) => navigate({ category: e.target.value || undefined })}
            className="h-10 bg-card md:w-56"
          >
            <option value="">{`All documents (${total})`}</option>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{`${c.label} (${counts[c.key]})`}</option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="relative min-w-0 md:min-w-56 md:flex-1">
        <label htmlFor="doc-search" className="sr-only">Search documents</label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id="doc-search"
          type="search"
          autoComplete="off"
          value={query}
          placeholder="Search by document name"
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault()
              clearSearch()
            }
          }}
          className={cn(
            'h-10 w-full min-w-0 rounded-lg border border-input bg-card pr-10 pl-9 text-sm text-foreground outline-none transition-colors',
            'placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none',
          )}
        />
        {query ? (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            aria-controls="doc-search"
            className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="doc-visibility" className="sr-only">Visibility</label>
        <NativeSelect
          id="doc-visibility"
          value={params.visibility ?? ''}
          onChange={(e) => navigate({ visibility: e.target.value || undefined })}
          className="h-10 min-w-0 flex-1 bg-card md:w-48 md:flex-none"
        >
          <option value="">Any visibility</option>
          <option value="internal">Internal only</option>
          <option value="homeowner">Shared with homeowner</option>
        </NativeSelect>

        <Link
          href={browseHref(base, {}, archived ? {} : { archived: '1' })}
          aria-current={archived ? 'page' : undefined}
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            archived
              ? 'border-primary/20 bg-interactive-soft font-medium text-primary'
              : 'border-input bg-card text-muted-foreground hover:text-primary',
          )}
        >
          <Archive className="size-4" aria-hidden="true" />
          {archived ? (
            'Active documents'
          ) : (
            <>
              <span className="hidden sm:inline">Archived</span>
              <span className="sr-only sm:hidden">Archived documents</span>
              {archivedCount !== null && (
                <span className="rounded-badge bg-[#F3F4F6] px-1.5 text-xs tabular-nums">{archivedCount}</span>
              )}
            </>
          )}
        </Link>
        <span className="flex size-4 shrink-0 items-center" aria-live="polite">
          {pending && (
            <>
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Updating results</span>
            </>
          )}
        </span>
      </div>
    </div>
  )
}
