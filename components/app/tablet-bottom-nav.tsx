'use client'

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, Clock, FolderKanban, House, Menu, NotebookPen, type LucideIcon } from 'lucide-react'
import { AppNav } from '@/components/app/app-nav'
import { bottomNavTabs, isTabActive, phoneNavTabs, type BottomTab, type BottomTabKey } from '@/lib/bottom-nav'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { NavGroup, NavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'

const tabClass =
  'flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50'
const activeClass = 'bg-link-soft text-link'
const idleClass = 'text-muted-foreground hover:bg-muted hover:text-foreground'

const TAB_ICONS: Record<BottomTabKey, LucideIcon> = {
  home: House,
  projects: FolderKanban,
  'my-work': ClipboardList,
  schedule: CalendarDays,
  'daily-logs': NotebookPen,
  time: Clock,
}

/** Same breakpoint as the nav's own `max-[599.98px]` class, so the More list matches the tabs on screen. */
const PHONE_QUERY = '(max-width: 599.98px)'
function subscribePhone(onChange: () => void) {
  const mql = window.matchMedia(PHONE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}
function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false)
}

/**
 * Phone and tablet primary navigation, then More.
 * - Phones are field-first: Home, Daily Logs, Time, Projects (see phoneNavTabs).
 * - Tablets: the same with one more slot: Home, Projects, Daily Logs, Time, Schedule (see bottomNavTabs).
 * Both rows are rendered and CSS shows the right one on first paint. Everything else the role can reach is in More,
 * built from the same permission-filtered list as the sidebar.
 */
export function TabletBottomNav({
  items,
  homeHref,
  openGroup,
}: {
  items: NavItem[]
  homeHref: string
  openGroup: NavGroup | null
}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const isActive = (href: string) => isTabActive(pathname, href)

  const isPhone = useIsPhone()
  const hrefs = items.map((i) => i.href)
  const withIcons = (tabs: BottomTab[]) => tabs.map((tab) => ({ ...tab, Icon: TAB_ICONS[tab.key] }))
  const phoneTabs = withIcons(phoneNavTabs(hrefs, homeHref))
  const tabletTabs = withIcons(bottomNavTabs(hrefs, homeHref))
  const shown = isPhone ? phoneTabs : tabletTabs
  const primaryHrefs = new Set(shown.map((p) => p.href))
  const moreItems = items.filter((i) => !primaryHrefs.has(i.href))
  const moreActive = !shown.some((p) => isActive(p.href)) && moreItems.some((i) => isActive(i.href))

  const row = (tabs: typeof shown, className: string) => (
    <ul className={cn('mx-auto max-w-xl items-stretch gap-1 px-3 py-1.5', className)}>
      {tabs.map(({ href, label, Icon }) => {
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
  )

  return (
    <nav
      data-tablet-bottom-nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 hidden max-[599.98px]:block border-t border-[#D6DDE5] bg-white/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-[0_-1px_2px_rgba(23,77,50,0.04)] backdrop-blur tablet:block print:hidden"
    >
      {row(phoneTabs, 'flex min-[600px]:hidden')}
      {row(tabletTabs, 'hidden min-[600px]:flex')}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="right" className="w-[min(22rem,85vw)] gap-0 p-0">
          <SheetHeader className="border-b px-4 py-4">
            <SheetTitle className="type-section-title">More</SheetTitle>
            <SheetDescription>Every area your role can open.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <AppNav items={moreItems} openGroup={openGroup} onNavigate={() => setMoreOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  )
}
