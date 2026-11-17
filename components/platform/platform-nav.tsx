'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const ITEMS = [
  { href: '/platform', label: 'Companies', match: (p: string) => p === '/platform' || p.startsWith('/platform/companies') },
  { href: '/platform/users', label: 'Users', match: (p: string) => p.startsWith('/platform/users') },
]

export function PlatformNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label="Owner console" className="flex items-center gap-1 sm:ml-4">
      {ITEMS.map((item) => {
        const active = item.match(pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors',
              active ? 'bg-interactive-soft text-interactive-strong' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
