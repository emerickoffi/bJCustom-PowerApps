'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, FolderKanban, House, Menu } from 'lucide-react'
import { AppNav } from '@/components/app/app-nav'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { NavGroup, NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const tabClass =
  'flex min-h-14 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
const activeClass = 'bg-link-soft text-link'
const idleClass = 'text-muted-foreground hover:bg-muted hover:text-foreground'

/**
 * Tablet primary navigation: Home, Projects, Schedule (when the module is available to this role), More.
 * Everything else the role can reach is in More, built from the same permission-filtered list as the sidebar.
 */
export function TabletBottomNav({
  items,
  homeHref,
  closedGroups,
}: {
  items: NavItem[]
  homeHref: string
  closedGroups: NavGroup[]
}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const primary = [
    { href: homeHref, label: 'Home', Icon: House },
    { href: '/projects', label: 'Projects', Icon: FolderKanban },
    ...(items.some((i) => i.href === '/schedule') ? [{ href: '/schedule', label: 'Schedule', Icon: CalendarDays }] : []),
  ]
  const primaryHrefs = new Set(primary.map((p) => p.href))
  const moreItems = items.filter((i) => !primaryHrefs.has(i.href))
  const moreActive = !primary.some((p) => isActive(p.href)) && moreItems.some((i) => isActive(i.href))

  return (
    <nav
      data-tablet-bottom-nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-[#D6DDE5] bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-[0_-1px_2px_rgba(23,77,50,0.04)] backdrop-blur tablet:block print:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-stretch gap-1 px-3 py-1.5">
        {primary.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <li key={href} className="flex flex-1">
              <Link href={href} aria-current={active ? 'page' : undefined} className={cn(tabClass, active ? activeClass : idleClass)}>
                <Icon className="size-5" aria-hidden="true" />
                {label}
              </Link>
            </li>
          )
        })}
        <li className="flex flex-1">
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            className={cn(tabClass, moreActive ? activeClass : idleClass)}
          >
            <Menu className="size-5" aria-hidden="true" />
            More
          </button>
        </li>
      </ul>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="right" className="w-[min(22rem,85vw)] gap-0 p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="font-serif text-lg">More</SheetTitle>
            <SheetDescription>Every area your role can open.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <AppNav items={moreItems} closedGroups={closedGroups} onNavigate={() => setMoreOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
