import Link from 'next/link'
import { House, UsersRound } from 'lucide-react'

const TABS = [
  { value: 'staff', label: 'Staff Accounts', href: '/team', icon: UsersRound },
  { value: 'homeowners', label: 'Homeowner Accounts', href: '/team?tab=homeowners', icon: House },
] as const

export function UsersAccessTabs({ active }: { active: (typeof TABS)[number]['value'] }) {
  return (
    <nav aria-label="Account type" className="-mt-2 border-b border-[#D6DDE5]">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
          const current = tab.value === active
          return (
            <li key={tab.value}>
              <Link
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className="-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-interactive-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive/50 aria-[current=page]:border-interactive aria-[current=page]:text-interactive-strong"
              >
                <tab.icon className="size-4" aria-hidden="true" />
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
