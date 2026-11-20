'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppNav } from '@/components/app/app-nav'
import { TrefortLogo, TrefortMark } from '@/components/brand/trefort-logo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { NavGroup, NavItem } from '@/lib/navigation'
import { SIDEBAR_COOKIE, type SidebarMode } from '@/lib/sidebar'

const DESKTOP_QUERY = '(min-width: 80rem)'

export function Sidebar({
  items,
  homeLabel,
  homeHref = '/dashboard',
  defaultMode,
  openGroup,
  companyName,
  companyLogoUrl,
}: {
  /** The builder's own logo replaces Trefort's at the top when uploaded (Trefort is credited at the bottom). */
  companyName?: string
  companyLogoUrl?: string
  items: NavItem[]
  homeLabel: string
  homeHref?: string
  defaultMode: SidebarMode
  openGroup?: NavGroup | null
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
              'flex h-14 shrink-0 items-center bg-[#00788d] sm:h-16',
              collapsed ? 'justify-center px-2' : 'px-5',
            )}
          >
            <Link
              href={homeHref}
              aria-label={homeLabel}
              className={cn(
                'block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#00788d]',
                collapsed ? 'w-8' : companyLogoUrl ? 'w-full' : 'w-36 max-w-full',
              )}
            >
              {companyLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- builders host their logo anywhere
                <img
                  src={companyLogoUrl}
                  alt={companyName ?? ''}
                  className={cn('rounded-md bg-white object-contain', collapsed ? 'size-8 p-0.5' : 'h-11 w-full max-w-48 px-2 py-1')}
                />
              ) : collapsed ? (
                <TrefortMark priority />
              ) : (
                <TrefortLogo priority />
              )}
            </Link>
          </div>
          <div className={cn('flex-1 overflow-y-auto overflow-x-hidden py-6', collapsed ? 'px-3' : 'px-4')}>
            <AppNav items={items} collapsed={collapsed} openGroup={openGroup} />
          </div>
          {companyLogoUrl && !collapsed && (
            <p className="shrink-0 px-6 pb-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-muted">Powered by Trefort</p>
          )}
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
                className="flex h-[2.625rem] w-full items-center gap-3 rounded-nav px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
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
