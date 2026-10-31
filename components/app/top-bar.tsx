'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, ChevronRight, LogOut, UserRound } from 'lucide-react'
import { SearchInput } from '@/components/shared/search-input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'
import { openNotificationAction } from '@/app/actions/warranty'

export type HeaderNotification = {
  id: string
  title: string
  detail: string
  href: string
  notificationId?: string
  actionRequired?: boolean
}

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  'my-work': 'My Work',
  projects: 'Projects',
  clients: 'Clients',
  subcontractors: 'Subcontractors',
  team: 'Team',
  settings: 'Settings',
  profile: 'Profile',
  schedule: 'Schedule',
  walkthroughs: 'Walkthroughs',
  issues: 'Issues',
  new: 'New',
  edit: 'Edit',
  modules: 'Modules',
  portal: 'Home',
}

const ID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function useCrumbs(rootHref: string, rootLabel: string, labels?: Record<string, string>) {
  const pathname = usePathname()
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: { href: string; label: string }[] = []
  let href = ''
  for (const part of parts) {
    href += `/${part}`
    if (href === rootHref) continue
    const label =
      labels?.[part] ?? (ID_LIKE.test(part) ? 'Details' : (SEGMENT_LABELS[part] ?? part.replace(/-/g, ' ')))
    crumbs.push({ href, label })
  }
  return [{ href: rootHref, label: rootLabel }, ...crumbs]
}

/** `labels` maps known ids (e.g. the current job) to names; other ids fall back to "Details". */
export function Breadcrumbs({
  rootHref,
  rootLabel,
  labels,
}: {
  rootHref: string
  rootLabel: string
  labels?: Record<string, string>
}) {
  const crumbs = useCrumbs(rootHref, rootLabel, labels)
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={c.href} className={cn('flex min-w-0 items-center gap-1.5', !last && 'hidden sm:flex')}>
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />}
              {last ? (
                <span aria-current="page" className="truncate font-medium capitalize text-foreground">
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="truncate capitalize text-muted-foreground transition-colors hover:text-primary">
                  {c.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function HeaderSearch() {
  return (
    <form action="/projects" role="search" className="hidden w-full max-w-xs md:block">
      <SearchInput
        id="global-search"
        label="Search projects"
        placeholder="Search projects, addresses..."
        syncUrl={false}
        inputClassName="rounded-xl border-transparent bg-muted/80 focus-visible:border-primary/30 focus-visible:bg-card focus-visible:ring-primary/10"
      />
    </form>
  )
}

const iconButton =
  'relative flex size-11 shrink-0 items-center justify-center rounded-xl md:size-10 text-muted-foreground transition-colors hover:bg-sage/70 hover:text-primary aria-expanded:bg-sage aria-expanded:text-primary'

export function NotificationBell({ items, emptyHref }: { items: HeaderNotification[]; emptyHref: string }) {
  const count = items.length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={iconButton}
        aria-label={count ? `Notifications, ${count} need attention` : 'Notifications'}
      >
        <Bell className="size-[1.125rem]" aria-hidden="true" />
        {count > 0 && (
          <span className="tabular absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-champagne px-1 text-[0.625rem] font-semibold leading-4 text-white ring-2 ring-background">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2.5 py-2 text-sm font-semibold text-foreground">Needs attention</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {count === 0 ? (
          <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">{"You're all caught up."}</p>
        ) : (
          items.slice(0, 6).map((n) => (
            <DropdownMenuItem
              key={n.id}
              render={<Link href={n.href} />}
              onClick={() => {
                if (n.notificationId) void openNotificationAction(n.notificationId)
              }}
              className="flex flex-col items-start gap-0.5 px-2.5 py-2"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                {n.title}
                {n.actionRequired && (
                  <span className="rounded-full bg-champagne/15 px-1.5 py-0.5 text-[0.625rem] font-semibold text-champagne">
                    Action required
                  </span>
                )}
              </span>
              <span className="line-clamp-1 text-xs text-muted-foreground">{n.detail}</span>
            </DropdownMenuItem>
          ))
        )}
        {count > 6 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={emptyHref} />} className="justify-center text-sm font-medium text-primary">
              View all
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ProfileMenu({
  name,
  email,
  roleLabel,
  profileHref,
}: {
  name: string | null
  email: string
  roleLabel: string
  profileHref: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2.5 rounded-xl p-1 pr-1 transition-colors md:min-h-0 md:min-w-0 hover:bg-sage/70 aria-expanded:bg-sage sm:pr-3"
        aria-label="Account menu"
      >
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground ring-2 ring-champagne/40"
          aria-hidden="true"
        >
          {initials(name || email)}
        </span>
        <span className="hidden min-w-0 flex-col text-left leading-tight sm:flex">
          <span className="max-w-36 truncate text-sm font-medium text-foreground">{name || email}</span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2">
            <span className="truncate text-sm font-semibold text-foreground">{name || 'Your account'}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href={profileHref} />} className="gap-2 px-2.5 py-2">
          <UserRound className="size-4" aria-hidden="true" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-muted"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
