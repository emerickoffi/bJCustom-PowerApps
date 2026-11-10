'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SEARCH_DEBOUNCE_MS = 350

/**
 * Filter form that applies on change: selects immediately, search text after a short pause.
 * Only fields inside the form (plus its hidden inputs) reach the URL, so `page` is dropped on every change.
 */
export function AutoApplyForm({
  children,
  clearHref,
  carryParams,
  className,
}: {
  children: React.ReactNode
  clearHref?: string
  /** URL parameters set on the client after render (so no hidden input knows them) that survive applying and clearing. */
  carryParams?: readonly string[]
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const formRef = useRef<HTMLFormElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [generation, setGeneration] = useState(0)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    // Back/forward changes the URL without remounting the form, so reset fields to the new URL state.
    const onPop = () => setGeneration((g) => g + 1)
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function carry(params: URLSearchParams) {
    const current = new URLSearchParams(window.location.search)
    for (const name of carryParams ?? []) {
      const value = current.get(name)
      if (value && !params.has(name)) params.set(name, value)
    }
  }

  function apply() {
    const form = formRef.current
    if (!form) return
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
    }
    carry(params)
    const query = params.toString()
    if (query === window.location.search.replace(/^\?/, '')) return
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }))
  }

  function schedule(delay: number) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(apply, delay)
  }

  return (
    <form
      ref={formRef}
      role="search"
      aria-busy={pending}
      className={cn(className, pending && 'opacity-80 transition-opacity')}
      onChange={(e) => {
        const target = e.target as unknown as HTMLInputElement
        // Deferred a tick so dependent fields (e.g. city resetting after state) have committed.
        schedule(target.type === 'search' ? SEARCH_DEBOUNCE_MS : 0)
      }}
      onSubmit={(e) => {
        e.preventDefault()
        schedule(0)
      }}
    >
      <div key={generation} className="contents">
        {children}
      </div>
      {clearHref && (
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-10"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current)
            setGeneration((g) => g + 1)
            const target = new URL(clearHref, window.location.origin)
            carry(target.searchParams)
            startTransition(() => router.replace(`${target.pathname}${target.search}`, { scroll: false }))
          }}
        >
          Clear filters
        </Button>
      )}
    </form>
  )
}
