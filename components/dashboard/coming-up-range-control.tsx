'use client'

import { useOptimistic, useTransition } from 'react'
import { setComingUpRangeAction } from '@/app/actions/dashboard-preferences'
import { COMING_UP_RANGE_LABELS, COMING_UP_RANGES, type ComingUpRange } from '@/lib/coming-up'
import { segmentClass } from '@/lib/interaction-styles'
import { cn } from '@/lib/utils'

/** Saves the choice per user and workspace, so it is restored on refresh and on return to the Dashboard. */
export function ComingUpRangeControl({ range }: { range: ComingUpRange }) {
  const [optimistic, setOptimistic] = useOptimistic(range)
  const [pending, startTransition] = useTransition()

  const choose = (value: ComingUpRange) => {
    if (value === optimistic) return
    startTransition(async () => {
      setOptimistic(value)
      await setComingUpRangeAction(value)
    })
  }

  return (
    <div
      role="radiogroup"
      aria-label="Coming up window"
      aria-busy={pending || undefined}
      className="flex rounded-lg bg-muted p-0.5"
    >
      {COMING_UP_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={r === optimistic}
          onClick={() => choose(r)}
          className={cn(
            'flex min-h-9 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium',
            segmentClass(r === optimistic),
            r === optimistic && 'shadow-sm',
          )}
        >
          {COMING_UP_RANGE_LABELS[r]}
        </button>
      ))}
    </div>
  )
}
