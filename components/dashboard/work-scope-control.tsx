'use client'

import { useOptimistic, useTransition } from 'react'
import { Info } from 'lucide-react'
import { setWorkScopeAction } from '@/app/actions/dashboard-preferences'
import { segmentClass } from '@/lib/interaction-styles'
import { cn } from '@/lib/utils'

type WorkScope = 'all' | 'mine'

const OPTIONS: { value: WorkScope; label: string }[] = [
  { value: 'all', label: 'All work' },
  { value: 'mine', label: 'My work' },
]

export function WorkScopeControl({ scope }: { scope: WorkScope }) {
  const [optimistic, setOptimistic] = useOptimistic(scope)
  const [pending, startTransition] = useTransition()

  const choose = (value: WorkScope) => {
    if (value === optimistic) return
    startTransition(async () => {
      setOptimistic(value)
      await setWorkScopeAction(value)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Work scope"
        aria-describedby="work-scope-help"
        aria-busy={pending || undefined}
        className="flex rounded-lg bg-muted p-0.5"
      >
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === optimistic}
            onClick={() => choose(o.value)}
            className={cn(
              'flex min-h-9 items-center justify-center rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              segmentClass(o.value === optimistic),
              o.value === optimistic && 'shadow-sm',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <span className="group relative flex">
        <button
          type="button"
          aria-label="About My work"
          aria-describedby="work-scope-help"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="size-4" aria-hidden="true" />
        </button>
        <span
          id="work-scope-help"
          role="tooltip"
          className="pointer-events-none invisible absolute right-0 top-full z-20 mt-1 w-64 rounded-md border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
        >
          Applies to Action Center and Coming Up. My work shows only items assigned to you. Unassigned items appear
          under All work.
        </span>
      </span>
    </div>
  )
}
