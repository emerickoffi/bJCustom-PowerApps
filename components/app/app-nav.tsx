'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookUser,
  Building2,
  CalendarRange,
  Calculator,
  ChevronDown,
  ClipboardList,
  FileText,
  FolderKanban,
  HardHat,
  LayoutDashboard,
  ListChecks,
  Palette,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { NAV_GROUPS, NAV_OPEN_GROUP_COOKIE, PERSISTENT_NAV_GROUP, type NavGroup, type NavItem } from '@/lib/navigation'

export const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  'my-work': ListChecks,
  projects: FolderKanban,
  clients: Users,
  subcontractors: HardHat,
  contacts: BookUser,
  team: UsersRound,
  settings: Settings,
  schedule: CalendarRange,
  estimates: Calculator,
  warranty: ShieldCheck,
  selections: Palette,
  'change-orders': Repeat,
  documents: FileText,
  'daily-logs': ClipboardList,
  invoices: Receipt,
  organization: Building2,
}

function NavLink({
  href,
  label,
  icon,
  active,
  nested,
  collapsed,
  onNavigate,
}: {
  href: string
  label: string
  icon: string
  active: boolean
  nested?: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const Icon = ICONS[icon] ?? LayoutDashboard
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex items-center rounded-nav transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
        nested ? 'h-10 gap-2.5 px-3 text-[0.8125rem] lg:h-9' : 'h-11 gap-3 px-3.5 text-sm',
        collapsed && 'h-11 justify-center px-0',
        active
          ? 'bg-sidebar-selected font-semibold text-sidebar-selected-foreground'
          : 'font-medium text-sidebar-foreground hover:bg-sidebar-hover',
      )}
    >
      <Icon
        className={cn(
          'shrink-0',
          nested && !collapsed ? 'size-4' : 'size-[1.125rem]',
          active ? 'text-sidebar-selected-icon' : 'text-sidebar-icon',
        )}
        aria-hidden="true"
      />
      <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
    </Link>
  )
  if (!collapsed) return link
  // The label stays in the link as sr-only text; the tooltip shows it on hover and keyboard focus.
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function AppNav({
  items,
  onNavigate,
  collapsed,
  openGroup: initialOpenGroup = null,
}: {
  items: NavItem[]
  onNavigate?: () => void
  collapsed?: boolean
  /** The single expanded group, read from the cookie on the server so the first paint matches. */
  openGroup?: NavGroup | null
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const idPrefix = useId()

  const sections = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => (item.group ?? 'workspace') === group.key),
  })).filter((section) => section.items.length > 0)
  const activeGroup =
    sections.find((section) => section.key !== PERSISTENT_NAV_GROUP && section.items.some((item) => isActive(item.href)))
      ?.key ?? null

  const [openGroup, setOpenGroup] = useState<NavGroup | null>(activeGroup ?? initialOpenGroup)
  // Navigating into a group opens it (closing the others); navigating to an ungrouped page leaves the accordion alone.
  const [syncedPath, setSyncedPath] = useState(pathname)
  if (pathname !== syncedPath) {
    setSyncedPath(pathname)
    if (activeGroup && activeGroup !== openGroup) setOpenGroup(activeGroup)
  }

  function toggleGroup(key: NavGroup) {
    const next = openGroup === key ? null : key
    setOpenGroup(next)
    document.cookie = `${NAV_OPEN_GROUP_COOKIE}=${next ?? 'none'}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <nav aria-label="Main" className={cn('flex flex-col', collapsed ? 'gap-3' : 'gap-1')}>
      {sections.map((section, index) => {
        const persistent = section.key === PERSISTENT_NAV_GROUP
        const containsActive = section.key === activeGroup
        const open = openGroup === section.key
        const panelId = `${idPrefix}-${section.key}`
        const links = section.items.map((item) => (
          <NavLink
            key={item.href}
            {...item}
            active={isActive(item.href)}
            nested={!persistent}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))

        if (collapsed) {
          return (
            <div key={section.key} role="group" aria-label={section.label} className="flex flex-col gap-1">
              {index > 0 && <span className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden="true" />}
              {links}
            </div>
          )
        }
        if (persistent) {
          return (
            <div key={section.key} role="group" aria-label={section.label} className="mb-2 flex flex-col gap-0.5">
              {links}
            </div>
          )
        }
        return (
          <div key={section.key} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleGroup(section.key)}
              aria-expanded={open}
              aria-controls={panelId}
              className={cn(
                'flex h-9 items-center justify-between rounded-nav px-3.5 text-xs font-medium transition-colors duration-150',
                'hover:bg-sidebar-hover hover:text-sidebar-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
                open || containsActive ? 'text-sidebar-foreground' : 'text-sidebar-muted',
              )}
            >
              <span className="flex items-center gap-2">
                {section.label}
                {containsActive && !open && (
                  <span className="size-1.5 rounded-full bg-sidebar-selected-icon" aria-label="contains current page" />
                )}
              </span>
              <ChevronDown
                className={cn('size-3.5 transition-transform duration-150', !open && '-rotate-90')}
                aria-hidden="true"
              />
            </button>
            <div
              id={panelId}
              role="group"
              aria-label={section.label}
              inert={!open || undefined}
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-150 ease-out motion-reduce:transition-none',
                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden pb-1 pl-2 pt-0.5">{links}</div>
            </div>
          </div>
        )
      })}
    </nav>
  )
}
