'use client'

import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { LayoutGrid, Rows3 } from 'lucide-react'
import { DIRECTORY_VIEW_COOKIE, type DirectoryModule, type DirectoryView } from '@/lib/directory'
import { cn } from '@/lib/utils'

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
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-[#E2E8E2] bg-card p-0.5">
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
              'inline-flex h-9 min-w-11 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
              active ? 'bg-[#174D32] text-white shadow-xs' : 'text-muted-foreground hover:bg-[#EAF0E9] hover:text-[#103B27]',
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
}: {
  module: DirectoryModule
  initialView: DirectoryView | null
  desktopDefault: DirectoryView
  mobileDefault?: DirectoryView
  summary: ReactNode
  controls?: ReactNode
  cards: ReactNode
  table: ReactNode
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

  return (
    <div className="flex flex-col gap-4">
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
