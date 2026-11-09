'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { LoaderCircle, RotateCw, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { INVOICE_SEARCH_MAX, invoiceListHref, type InvoiceListFilter } from '@/lib/invoice-list-filters'

const SEARCH_DEBOUNCE_MS = 300

export function InvoicesToolbar({ status, query }: { status?: InvoiceListFilter; query: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(query)
  const [syncedQuery, setSyncedQuery] = useState(query)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Follow URL changes made elsewhere (tabs, back/forward) without clobbering typing.
  if (query !== syncedQuery) {
    setSyncedQuery(query)
    setText(query)
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const navigate = (next: { status?: InvoiceListFilter; q?: string }) => {
    if (timer.current) clearTimeout(timer.current)
    startTransition(() => {
      router.replace(invoiceListHref({ status: next.status, q: next.q }), { scroll: false })
    })
  }

  const onSearchChange = (value: string) => {
    setText(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => navigate({ status, q: value }), SEARCH_DEBOUNCE_MS)
  }

  const hasSearch = !!query || !!text.trim()
  const hasFilters = hasSearch || !!status

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <div role="search" className="relative min-w-0 flex-[1_1_16rem] md:max-w-md">
        <label htmlFor="invoice-search" className="sr-only">
          Search invoices
        </label>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="invoice-search"
          type="search"
          value={text}
          maxLength={INVOICE_SEARCH_MAX}
          autoComplete="off"
          placeholder="Search number, title, project, or homeowner"
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
            navigate({ status, q: text })
          }}
          className="h-11 bg-card pl-8 md:h-9"
        />
      </div>
      {hasSearch && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          onClick={() => {
            setText('')
            navigate({ status })
          }}
        >
          <X data-icon="inline-start" />
          Clear search
        </Button>
      )}
      {hasFilters && status && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          onClick={() => {
            setText('')
            navigate({})
          }}
        >
          Clear all filters
        </Button>
      )}
      {pending && (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Updating results" role="status" />
      )}
    </div>
  )
}

export function RetryButton() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="min-h-11 md:min-h-9"
    >
      <RotateCw data-icon="inline-start" className={pending ? 'animate-spin' : undefined} />
      Retry
    </Button>
  )
}
