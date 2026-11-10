'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, LoaderCircle, RotateCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pillClass } from '@/lib/interaction-styles'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { INVOICE_SEARCH_MAX, invoiceListHref, type InvoiceListFilter } from '@/lib/invoice-list-filters'

const SEARCH_DEBOUNCE_MS = 300

export function InvoicesToolbar({
  status,
  overdue,
  overdueCount,
  query,
  summary,
}: {
  status?: InvoiceListFilter
  overdue: boolean
  overdueCount: number
  query: string
  summary?: string
}) {
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

  // Omitting `page` resets pagination whenever search or filters change.
  const navigate = (next: { status?: InvoiceListFilter; overdue?: boolean; q?: string }) => {
    if (timer.current) clearTimeout(timer.current)
    startTransition(() => {
      router.replace(invoiceListHref(next), { scroll: false })
    })
  }

  const onSearchChange = (value: string) => {
    setText(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => navigate({ status, overdue, q: value }), SEARCH_DEBOUNCE_MS)
  }

  const hasSearch = !!query || !!text.trim()

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
            navigate({ status, overdue, q: text })
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
            navigate({ status, overdue })
          }}
        >
          <X data-icon="inline-start" />
          Clear search
        </Button>
      )}
      {pending && (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-label="Updating results" role="status" />
      )}
      <div className="ml-auto flex items-center gap-3">
        <p className="text-xs tabular-nums text-muted-foreground empty:hidden" aria-live="polite">
          {summary}
        </p>
        <button
          type="button"
          aria-pressed={overdue}
          onClick={() => navigate({ status, overdue: !overdue, q: query })}
          className={cn(
            'inline-flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium md:h-9',
            pillClass(overdue),
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-4 items-center justify-center rounded-[4px] border',
              overdue ? 'border-action bg-action text-white' : 'border-input bg-card',
            )}
          >
            {overdue && <Check className="size-3" strokeWidth={3} />}
          </span>
          Overdue only
          <span className={cn('text-xs tabular-nums', overdue ? 'text-foreground/70' : 'text-muted-foreground')}>
            {overdueCount}
            <span className="sr-only">{overdueCount === 1 ? ' invoice' : ' invoices'}</span>
          </span>
        </button>
      </div>
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
