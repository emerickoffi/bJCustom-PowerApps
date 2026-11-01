'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppNav } from '@/components/app/app-nav'
import type { NavGroup, NavItem } from '@/lib/navigation'
import { SIDEBAR_COOKIE, type SidebarMode } from '@/lib/sidebar'

const DESKTOP_QUERY = '(min-width: 80rem)'

export function Sidebar({
  items,
  logo,
  monogram,
  homeLabel,
  homeHref = '/dashboard',
  defaultMode,
  closedGroups,
}: {
  items: NavItem[]
  logo: React.ReactNode
  monogram: string
  homeLabel: string
  homeHref?: string
  defaultMode: SidebarMode
  closedGroups?: NavGroup[]
}) {
  const [mode, setMode] = useState<SidebarMode>(defaultMode)

  function toggle() {
    const currentlyCollapsed = mode === 'auto' ? !window.matchMedia(DESKTOP_QUERY).matches : mode === 'collapsed'
    const next = currentlyCollapsed ? 'expanded' : 'collapsed'
    setMode(next)
    document.cookie = `${SIDEBAR_COOKIE}=${next === 'collapsed' ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
  }

  // In auto mode both variants are rendered and CSS picks one, so the first paint is correct at every width.
  const variants: { collapsed: boolean; className?: string }[] =
    mode === 'auto'
      ? [
          { collapsed: true, className: 'xl:hidden' },
          { collapsed: false, className: 'hidden xl:contents' },
        ]
      : [{ collapsed: mode === 'collapsed' }]

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex',
        mode === 'auto' ? 'w-[4.75rem] xl:w-[17rem]' : mode === 'collapsed' ? 'w-[4.75rem]' : 'w-[17rem]',
      )}
    >
      {variants.map(({ collapsed, className }) => (
        <div key={String(collapsed)} className={cn('flex min-h-0 flex-1 flex-col', className)}>
          <div className={cn('flex h-24 shrink-0 items-center border-b border-sidebar-border', collapsed ? 'justify-center px-2' : 'px-7')}>
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
            <AppNav items={items} collapsed={collapsed} closedGroups={closedGroups} />
          </div>
          <div className={cn('border-t border-sidebar-border p-3', collapsed && 'flex justify-center')}>
            <button
              type="button"
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className={cn(
                'flex h-9 items-center gap-2 rounded-[0.625rem] px-3.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/45',
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
        </div>
      ))}
    </aside>
  )
}
