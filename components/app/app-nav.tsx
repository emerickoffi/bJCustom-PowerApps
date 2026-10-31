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
import {
  NAV_GROUPS,
  NAV_GROUPS_COOKIE,
  PERSISTENT_NAV_GROUP,
  PLANNED_MODULES,
  type NavGroup,
  type NavItem,
} from '@/lib/navigation'

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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

const UPCOMING = PLANNED_MODULES

function NavLink({
  href,
  label,
  icon,
  active,
  muted,
  collapsed,
  onNavigate,
}: {
  href: string
  label: string
  icon: string
  active: boolean
  muted?: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const Icon = ICONS[icon] ?? LayoutDashboard
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all duration-150',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-primary text-primary-foreground shadow-[0_6px_16px_-8px_rgb(23_77_50/0.7)]'
          : 'text-sidebar-foreground/80 hover:bg-sage/70 hover:text-primary',
        muted && !active && 'text-muted-foreground',
      )}
    >
      <Icon
        className={cn('size-[1.125rem] shrink-0', active ? 'text-champagne' : 'text-current')}
        aria-hidden="true"
      />
      <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
      {muted && !collapsed && (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">
          Soon
        </span>
      )}
    </Link>
  )
}

export function AppNav({
  items,
  onNavigate,
  collapsed,
  closedGroups = [],
}: {
  items: NavItem[]
  onNavigate?: () => void
  collapsed?: boolean
  /** Groups the user collapsed, read from the cookie on the server so the first paint matches. */
  closedGroups?: NavGroup[]
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const [closed, setClosed] = useState<NavGroup[]>(closedGroups)
  const idPrefix = useId()

  const sections = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => (item.group ?? 'workspace') === group.key),
  })).filter((section) => section.items.length > 0)
  const upcomingActive = UPCOMING.some((module) => isActive(`/modules/${module.slug}`))

  function toggleGroup(key: NavGroup) {
    const next = closed.includes(key) ? closed.filter((k) => k !== key) : [...closed, key]
    setClosed(next)
    document.cookie = `${NAV_GROUPS_COOKIE}=${next.join(',')}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <nav aria-label="Main" className="flex flex-col gap-4">
      {sections.map((section, index) => {
        const persistent = section.key === PERSISTENT_NAV_GROUP
        const containsActive = section.items.some((item) => isActive(item.href))
        // The group holding the current page always stays open, so navigating never hides the active link.
        const open = collapsed || persistent || containsActive || !closed.includes(section.key)
        const panelId = `${idPrefix}-${section.key}`
        const links = section.items.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />
        ))

        if (collapsed) {
          return (
            <div key={section.key} role="group" aria-label={section.label} className="flex flex-col gap-1">
              {index > 0 && <span className="mx-auto mb-1 h-px w-6 bg-border" aria-hidden="true" />}
              {links}
            </div>
          )
        }
        if (persistent) {
          return (
            <div key={section.key} role="group" aria-label={section.label} className="flex flex-col gap-1">
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
              disabled={containsActive}
              className={cn(
                'flex h-8 items-center justify-between rounded-lg px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors',
                'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                'disabled:cursor-default disabled:hover:text-muted-foreground',
              )}
            >
              {section.label}
              {!containsActive && (
                <ChevronDown
                  className={cn('size-3.5 transition-transform duration-200', !open && '-rotate-90')}
                  aria-hidden="true"
                />
              )}
            </button>
            <div
              id={panelId}
              role="group"
              aria-label={section.label}
              inert={!open || undefined}
              className={cn(
                'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="flex min-h-0 flex-col gap-1 overflow-hidden pt-1">{links}</div>
            </div>
          </div>
        )
      })}
      {!collapsed && UPCOMING.length > 0 && (
        <details open={upcomingActive} className="group/soon">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            Coming soon
            <ChevronDown className="size-3.5 transition-transform group-open/soon:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-1 flex flex-col gap-1">
            {UPCOMING.map((module) => (
              <NavLink
                key={module.slug}
                href={`/modules/${module.slug}`}
                label={module.label}
                icon={module.icon}
                active={isActive(`/modules/${module.slug}`)}
                muted
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </details>
      )}
    </nav>
  )
}
