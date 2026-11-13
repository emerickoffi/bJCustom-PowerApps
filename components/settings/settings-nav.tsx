'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getActiveSettingsHref, type SettingsNavItem } from '@/lib/settings-nav'

export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const pathname = usePathname()
  const activeHref = getActiveSettingsHref(pathname, items)
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Scroll only the tab strip (never the page) so the active tab stays visible on narrow screens.
  useEffect(() => {
    const scroller = scrollerRef.current
    const active = scroller?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!scroller || !active) return
    const left = active.offsetLeft - scroller.offsetLeft
    if (left < scroller.scrollLeft || left + active.offsetWidth > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollLeft = left - 8
    }
  }, [activeHref])

  return (
    <nav aria-label="Settings sections" className="min-w-0">
      <div
        ref={scrollerRef}
        className="flex min-w-0 gap-1 overflow-x-auto rounded-panel border border-border bg-muted/60 p-1 [scrollbar-width:thin]"
      >
        {items.map((item) => {
          const active = item.href === activeHref
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                active
                  ? 'bg-interactive text-white shadow-sm'
                  : 'text-muted-foreground hover:bg-interactive-soft hover:text-interactive-strong',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
