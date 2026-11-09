'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { LoaderCircle, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/shared/form-field'
import { EstimateTitleEditToggle } from '@/components/estimates/estimate-title-grid'

const SEARCH_DEBOUNCE_MS = 300

export function EstimatesToolbar({
  projectId,
  status,
  query,
  statuses,
}: {
  projectId?: string
  status?: string
  query: string
  statuses: { value: string; label: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [text, setText] = useState(query)
  const [syncedQuery, setSyncedQuery] = useState(query)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Follow URL changes made elsewhere (back/forward, summary links) without clobbering typing.
  if (query !== syncedQuery) {
    setSyncedQuery(query)
    setText(query)
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const navigate = (next: { status?: string; q?: string }) => {
    if (timer.current) clearTimeout(timer.current)
    const params = new URLSearchParams()
    if (projectId) params.set('project', projectId)
    if (next.status) params.set('status', next.status)
    const q = next.q?.trim()
    if (q) params.set('q', q)
    const qs = params.toString()
    startTransition(() => {
      router.replace(qs ? `/estimates?${qs}` : '/estimates', { scroll: false })
    })
  }

  const onSearchChange = (value: string) => {
    setText(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => navigate({ status, q: value }), SEARCH_DEBOUNCE_MS)
  }

  const hasFilters = !!status || !!query.trim() || !!text.trim()

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-busy={pending}
    >
      <div role="search" className="relative min-w-0 flex-[1_1_16rem] md:max-w-md">
        <label htmlFor="estimate-search" className="sr-only">
          Search estimates
        </label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="estimate-search"
          type="search"
          value={text}
          maxLength={100}
          autoComplete="off"
          placeholder="Search title, number, client, or project"
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
            navigate({ status, q: text })
          }}
          className="h-11 bg-card pl-8 md:h-9"
        />
      </div>
      <label htmlFor="estimate-status" className="sr-only">
        Status
      </label>
      <NativeSelect
        id="estimate-status"
        value={status ?? ''}
        onChange={(e) => navigate({ status: e.target.value || undefined, q: text })}
        className="h-11 w-auto min-w-40 flex-[0_1_12rem] bg-card md:h-9"
      >
        <option value="">All statuses</option>
        {statuses.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </NativeSelect>
      {hasFilters && (
        <Button
          type="button"
          variant="ghost"
          className="h-11 md:h-9"
          onClick={() => {
            setText('')
            navigate({})
          }}
        >
          <X data-icon="inline-start" />
          Clear filters
        </Button>
      )}
      <span className="flex size-5 items-center justify-center text-muted-foreground" aria-hidden="true">
        {pending && <LoaderCircle className="size-4 animate-spin" />}
      </span>
      <span className="sr-only" aria-live="polite">
        {pending ? 'Updating estimates' : ''}
      </span>
      <div className="ml-auto">
        <EstimateTitleEditToggle />
      </div>
    </div>
  )
}
