'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { DIRECTORY_VIEW_COOKIE, type DirectoryModule, type DirectoryView } from '@/lib/directory'
import { cn } from '@/lib/utils'
import { segmentClass } from '@/lib/interaction-styles'

const DESKTOP_QUERY = '(min-width: 1024px)'

function subscribeDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  )
}

const VIEW_OPTIONS: { value: DirectoryView; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'table', label: 'Table', icon: Rows3 },
]

export function DirectoryViewSwitcher({
  value,
  onChange,
  label,
}: {
  value: DirectoryView
  onChange: (view: DirectoryView) => void
  label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-[#D6DDE5] bg-card p-0.5">
      {VIEW_OPTIONS.map(({ value: option, label: optionLabel, icon: Icon }) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={`${optionLabel} view`}
            onClick={() => onChange(option)}
            className={cn(
              'inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium',
              segmentClass(active),
              active && 'shadow-xs',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {optionLabel}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Both views are server-rendered once from the same page of data, so switching is
 * instant and never refetches. An explicit choice is remembered in a cookie and the
 * URL; without one, the responsive default is applied with CSS to avoid layout flash.
 */
export function DirectoryViews({
  module,
  initialView,
  desktopDefault,
  mobileDefault = 'cards',
  summary,
  controls,
  cards,
  table,
  leading,
  summaryAddon,
  empty,
}: {
  module: DirectoryModule
  initialView: DirectoryView | null
  desktopDefault: DirectoryView
  mobileDefault?: DirectoryView
  summary: ReactNode
  controls?: ReactNode
  cards: ReactNode
  table: ReactNode
  /** Search and filters placed on the left of one shared toolbar row; the summary moves to a line beneath it. */
  leading?: ReactNode
  /** Extra content on the summary line, such as applied-filter chips (with `leading`). */
  summaryAddon?: ReactNode
  /** Shown instead of the views and view controls when there are no results (with `leading`). */
  empty?: ReactNode
}) {
  const [chosen, setChosen] = useState<DirectoryView | null>(initialView)
  const isDesktop = useIsDesktop()
  const active = chosen ?? (isDesktop ? desktopDefault : mobileDefault)

  const choose = (view: DirectoryView) => {
    setChosen(view)
    document.cookie = `${DIRECTORY_VIEW_COOKIE[module]}=${view}; path=/; max-age=31536000; samesite=lax`
    const url = new URL(window.location.href)
    url.searchParams.set('view', view)
    window.history.replaceState(window.history.state, '', url)
  }

  const visibility = (view: DirectoryView) => {
    if (chosen) return chosen === view ? '' : 'hidden'
    if (desktopDefault === mobileDefault) return desktopDefault === view ? '' : 'hidden'
    const showDesktop = desktopDefault === view
    return showDesktop ? 'hidden lg:block' : 'lg:hidden'
  }

  const switcher = (
    <DirectoryViewSwitcher
      value={active}
      onChange={choose}
      label={`${module === 'clients' ? 'Clients' : 'Projects'} directory view`}
    />
  )

  if (leading !== undefined) {
    // The leading filters keep one stable position in the tree, so typing a search that empties the list never remounts it.
    return (
      <div data-view={active} className="group/views flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 flex-[1_1_30rem]">{leading}</div>
          {!empty && (
            <div className="flex flex-wrap items-center gap-2">
              {controls}
              {switcher}
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 empty:hidden">
          {!empty && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {summary}
            </p>
          )}
          {summaryAddon}
        </div>
        {empty ?? (
          <>
            <div className={visibility('cards')}>{cards}</div>
            <div className={visibility('table')}>{table}</div>
          </>
        )}
      </div>
    )
  }

  return (
    // `data-view` lets a control that only applies to one view (such as a column picker) hide itself in the other.
    <div data-view={active} className="group/views flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {summary}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <DirectoryViewSwitcher
            value={active}
            onChange={choose}
            label={`${module === 'clients' ? 'Clients' : 'Projects'} directory view`}
          />
        </div>
      </div>
      <div className={visibility('cards')}>{cards}</div>
      <div className={visibility('table')}>{table}</div>
    </div>
  )
}
