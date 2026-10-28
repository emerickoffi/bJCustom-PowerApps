'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppNav } from '@/components/app/app-nav'
import type { NavItem } from '@/lib/navigation'

export const SIDEBAR_COOKIE = 'sidebar_collapsed'

export function Sidebar({
  items,
  logo,
  monogram,
  homeLabel,
  homeHref = '/dashboard',
  defaultCollapsed,
}: {
  items: NavItem[]
  logo: React.ReactNode
  monogram: string
  homeLabel: string
  homeHref?: string
  defaultCollapsed: boolean
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  function toggle() {
    const next = !collapsed
    setCollapsed(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-[4.75rem]' : 'w-[17rem]',
      )}
    >
      <div className={cn('flex h-24 items-center border-b border-sidebar-border/70', collapsed ? 'justify-center px-2' : 'px-6')}>
        <Link href={homeHref} aria-label={homeLabel} className={cn('block', collapsed ? 'w-auto' : 'w-44')}>
          {collapsed ? (
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary font-serif text-base font-semibold italic text-champagne">
              {monogram}
            </span>
          ) : (
            logo
          )}
        </Link>
      </div>
      <div className={cn('flex-1 overflow-y-auto py-6', collapsed ? 'px-3' : 'px-4')}>
        <AppNav items={items} collapsed={collapsed} />
      </div>
      <div className={cn('border-t border-sidebar-border/70 p-3', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sage/70 hover:text-primary',
            collapsed ? 'w-9 justify-center px-0' : 'w-full',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden="true" />
              Collapse
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
