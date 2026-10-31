'use client'

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
import { NAV_GROUPS, PLANNED_MODULES, type NavItem } from '@/lib/navigation'

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
}: {
  items: NavItem[]
  onNavigate?: () => void
  collapsed?: boolean
}) {
  const pathname = usePathname()
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  const sections = NAV_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => (item.group ?? 'workspace') === group.key),
  })).filter((section) => section.items.length > 0)
  const upcomingActive = UPCOMING.some((module) => isActive(`/modules/${module.slug}`))

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {sections.map((section, index) => (
        <div key={section.key} role="group" aria-label={section.label} className="flex flex-col gap-1">
          {!collapsed ? (
            <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{section.label}</p>
          ) : (
            index > 0 && <span className="mx-auto mb-1 h-px w-6 bg-border" aria-hidden="true" />
          )}
          {section.items.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} onNavigate={onNavigate} />
          ))}
        </div>
      ))}
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
