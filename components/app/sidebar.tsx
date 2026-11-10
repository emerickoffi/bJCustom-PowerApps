'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppNav } from '@/components/app/app-nav'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { NavGroup, NavItem } from '@/lib/navigation'
import { SIDEBAR_COOKIE, type SidebarMode } from '@/lib/sidebar'

const DESKTOP_QUERY = '(min-width: 80rem)'

/** "B & J Custom Homes" -> "BJ": a compact mark for the rail, since no square logo asset exists. */
function monogram(name: string) {
  const letters = name
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
  return letters.slice(0, 2).join('') || name.slice(0, 1).toUpperCase()
}

export function Sidebar({
  items,
  logo,
  brandName,
  homeLabel,
  homeHref = '/dashboard',
  defaultMode,
  closedGroups,
}: {
  items: NavItem[]
  logo: React.ReactNode
  brandName: string
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
      data-sidebar
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex',
        mode === 'auto'
          ? 'w-(--sidebar-width-collapsed) xl:w-(--sidebar-width)'
          : mode === 'collapsed'
            ? 'w-(--sidebar-width-collapsed)'
            : 'w-(--sidebar-width)',
      )}
    >
      {variants.map(({ collapsed, className }) => (
        <div key={String(collapsed)} className={cn('flex min-h-0 flex-1 flex-col', className)}>
          <div
            className={cn(
              'flex h-24 shrink-0 items-center border-b border-[#D6DDE5] bg-white',
              collapsed ? 'justify-center px-2' : 'px-4',
            )}
          >
            <Link
              href={homeHref}
              aria-label={homeLabel}
              className={cn(
                'block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                !collapsed && 'w-48 max-w-full',
              )}
            >
              {collapsed ? (
                <span
                  className="flex size-11 items-center justify-center rounded-nav bg-(--brand-primary) text-sm font-bold tracking-wide text-white"
                  aria-hidden="true"
                >
                  {monogram(brandName)}
                </span>
              ) : (
                logo
              )}
            </Link>
          </div>
          <div className={cn('flex-1 overflow-y-auto overflow-x-hidden py-6', collapsed ? 'px-3' : 'px-4')}>
            <AppNav items={items} collapsed={collapsed} closedGroups={closedGroups} />
          </div>
          <div className={cn('border-t border-sidebar-border', collapsed ? 'flex justify-center px-3 py-3' : 'p-4 py-3')}>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={toggle}
                      aria-label="Expand sidebar"
                      aria-expanded={false}
                      className="flex size-11 items-center justify-center rounded-nav text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                    />
                  }
                >
                  <PanelLeftOpen className="size-4" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  Expand sidebar
                </TooltipContent>
              </Tooltip>
            ) : (
              <button
                type="button"
                onClick={toggle}
                aria-label="Collapse sidebar"
                aria-expanded
                className="flex h-11 w-full items-center gap-3 rounded-nav px-3.5 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
              >
                <PanelLeftClose className="size-4" aria-hidden="true" />
                Collapse
              </button>
            )}
          </div>
        </div>
      ))}
    </aside>
  )
}
