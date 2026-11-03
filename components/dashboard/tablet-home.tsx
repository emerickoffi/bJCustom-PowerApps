'use client'

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { DEFAULT_TABLET_TAB, TABLET_TAB_LABELS, TABLET_TABS, type TabletTab } from '@/lib/tablet-home'
import { cn } from '@/lib/utils'

/**
 * Tabbed tablet Home. The selected tab lives in `?tab=` (replaced, not pushed) so returning from a record restores
 * it. Panels stay mounted and are hidden, so switching tabs or rotating never discards their state.
 */
export function TabletHome({ initialTab, panels }: { initialTab: TabletTab; panels: Record<TabletTab, ReactNode> }) {
  const [tab, setTab] = useState(initialTab)
  const tabRefs = useRef<Partial<Record<TabletTab, HTMLButtonElement | null>>>({})

  const select = (next: TabletTab, focus = false) => {
    setTab(next)
    if (focus) tabRefs.current[next]?.focus()
    const url = new URL(window.location.href)
    if (next === DEFAULT_TABLET_TAB) url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    window.history.replaceState(window.history.state, '', url)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABLET_TABS.indexOf(tab)
    const last = TABLET_TABS.length - 1
    const target =
      event.key === 'ArrowRight'
        ? TABLET_TABS[index === last ? 0 : index + 1]
        : event.key === 'ArrowLeft'
          ? TABLET_TABS[index === 0 ? last : index - 1]
          : event.key === 'Home'
            ? TABLET_TABS[0]
            : event.key === 'End'
              ? TABLET_TABS[last]
              : null
    if (!target) return
    event.preventDefault()
    select(target, true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Home views"
        onKeyDown={onKeyDown}
        className="flex w-full gap-1 rounded-xl border border-border bg-card p-1 shadow-xs sm:w-fit"
      >
        {TABLET_TABS.map((id) => {
          const selected = id === tab
          return (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[id] = el
              }}
              type="button"
              role="tab"
              id={`tablet-tab-${id}`}
              aria-selected={selected}
              aria-controls={`tablet-panel-${id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(id)}
              className={cn(
                'min-h-11 flex-1 rounded-lg px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none',
                selected ? 'bg-interactive text-white shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {TABLET_TAB_LABELS[id]}
            </button>
          )
        })}
      </div>

      {TABLET_TABS.map((id) => (
        <div
          key={id}
          role="tabpanel"
          id={`tablet-panel-${id}`}
          aria-labelledby={`tablet-tab-${id}`}
          hidden={id !== tab}
          tabIndex={0}
          className="focus-visible:outline-none"
        >
          {panels[id]}
        </div>
      ))}
    </div>
  )
}
