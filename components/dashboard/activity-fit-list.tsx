'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

export type ActivityFitEntry = { key: string; node: ReactNode }

/** Below this list height the card stops matching and falls back to its natural height. */
const MIN_LIST_HEIGHT = 120
const SIDE_BY_SIDE_QUERY = '(min-width: 1024px)'
/** Mirrors the timeline rail inset (`top-3` / `bottom-3`). */
const RAIL_INSET = 12

type Fit = { listHeight: number; count: number; railBottom: number }

export function ActivityFitList({
  entries,
  total,
  totalIsLowerBound,
  visibleLimit,
  anchorId,
}: {
  entries: ActivityFitEntry[]
  total: number
  totalIsLowerBound: boolean
  visibleLimit: number
  /** Element whose bottom edge this list should line up with when shown side by side. */
  anchorId?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [fit, setFit] = useState<Fit | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const list = listRef.current
    const anchor = anchorId ? document.getElementById(anchorId) : null
    if (expanded || !wrap || !list || !anchor) {
      setFit(null)
      return
    }
    const card = wrap.closest('section') ?? wrap
    const column = card.parentElement?.parentElement ?? null
    const mql = window.matchMedia(SIDE_BY_SIDE_QUERY)

    let frame = 0
    const measure = () => {
      frame = 0
      // A collapsed <details>, a hidden anchor or a stacked layout all mean natural height.
      if (!mql.matches || anchor.offsetParent === null || wrap.offsetParent === null) {
        setFit(null)
        return
      }
      const anchorBottom = anchor.getBoundingClientRect().bottom
      const wrapRect = wrap.getBoundingClientRect()
      // Space below the list (footer, padding) does not depend on the list's own height.
      const below = card.getBoundingClientRect().bottom - wrapRect.bottom
      const listHeight = Math.floor(anchorBottom - wrapRect.top - below)
      if (listHeight < MIN_LIST_HEIGHT) {
        setFit(null)
        return
      }
      let count = 0
      let lastBottom = 0
      for (const item of Array.from(list.children) as HTMLElement[]) {
        const bottom = item.offsetTop + item.offsetHeight
        if (bottom > listHeight) break
        count += 1
        lastBottom = bottom
      }
      if (count === 0) {
        setFit(null)
        return
      }
      const next = { listHeight, count, railBottom: list.offsetHeight - lastBottom + RAIL_INSET }
      setFit((prev) =>
        prev && prev.listHeight === next.listHeight && prev.count === next.count && prev.railBottom === next.railBottom
          ? prev
          : next,
      )
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    // Observing the list (not the clipped wrapper) catches width-driven reflow without reacting to our own height.
    const observer = new ResizeObserver(schedule)
    observer.observe(anchor)
    observer.observe(list)
    if (column) observer.observe(column)
    mql.addEventListener('change', schedule)
    const details = wrap.closest('details')
    details?.addEventListener('toggle', schedule)
    document.fonts?.ready.then(schedule)
    schedule()

    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      mql.removeEventListener('change', schedule)
      details?.removeEventListener('toggle', schedule)
    }
  }, [anchorId, expanded, entries.length])

  const shownCount = expanded ? entries.length : (fit?.count ?? Math.min(visibleLimit, entries.length))
  const hasMore = total > shownCount || totalIsLowerBound
  const totalLabel = `${total}${totalIsLowerBound ? '+' : ''}`
  const partiallyLoaded = totalIsLowerBound || total > entries.length

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={wrapRef}
        className={fit && !expanded ? 'overflow-hidden' : undefined}
        style={fit && !expanded ? { height: fit.listHeight } : undefined}
      >
        <ol
          ref={listRef}
          className="relative flex flex-col gap-5 before:absolute before:bottom-[var(--rail-bottom,0.75rem)] before:left-3.5 before:top-3 before:w-px before:bg-border"
          style={fit && !expanded ? ({ '--rail-bottom': `${fit.railBottom}px` } as React.CSSProperties) : undefined}
        >
          {entries.map((entry, index) => {
            const beyond = index >= shownCount
            // While fitted, overflow stays laid out (so it can be measured) but is invisible and inert.
            const fittedOut = beyond && fit !== null && !expanded
            return (
              <li
                key={entry.key}
                className={`relative flex gap-3 ${fittedOut ? 'invisible' : beyond ? 'hidden' : ''}`}
                aria-hidden={fittedOut || undefined}
                inert={fittedOut || undefined}
              >
                {entry.node}
              </li>
            )
          })}
        </ol>
      </div>

      {expanded && partiallyLoaded && (
        <p className="text-xs text-muted-foreground">{`Showing the ${entries.length} most recent of ${totalLabel} entries.`}</p>
      )}

      {(hasMore || expanded) && entries.length > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-md border-t pt-1 text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {expanded ? 'Show less' : `View all (${totalLabel})`}
          <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      ) : fit ? (
        <p className="flex min-h-10 shrink-0 items-center justify-center border-t pt-1 text-xs text-muted-foreground">
          {`Showing all ${totalLabel}`}
        </p>
      ) : null}
    </div>
  )
}
