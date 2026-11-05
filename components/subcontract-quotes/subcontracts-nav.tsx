import Link from 'next/link'
import { cn } from '@/lib/utils'

export function SubcontractsNav({ projectId, active }: { projectId: string; active: 'quotes' | 'work' }) {
  const base = `/projects/${projectId}/subcontractor-work`
  const items = [
    { key: 'quotes', label: 'Quotes', href: `${base}/quotes` },
    { key: 'work', label: 'Work verification', href: base },
  ] as const
  return (
    <nav aria-label="Subcontracts" className="flex gap-1 rounded-lg border border-border bg-card p-1 self-start">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            active === item.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
