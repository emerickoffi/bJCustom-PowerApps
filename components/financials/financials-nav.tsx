import Link from 'next/link'
import { cn } from '@/lib/utils'

export type FinancialsView = 'summary' | 'budget' | 'invoices'

export function parseFinancialsView(value: string | string[] | undefined, invoicesEnabled: boolean): FinancialsView {
  if (value === 'budget') return 'budget'
  if (value === 'invoices' && invoicesEnabled) return 'invoices'
  return 'summary'
}

export function FinancialsNav({ projectId, current, invoicesEnabled }: { projectId: string; current: FinancialsView; invoicesEnabled: boolean }) {
  const base = `/projects/${encodeURIComponent(projectId)}/financials`
  const items: { view: FinancialsView; label: string; href: string }[] = [
    { view: 'summary', label: 'Summary', href: base },
    { view: 'budget', label: 'Budget & costs', href: `${base}?view=budget` },
    ...(invoicesEnabled ? [{ view: 'invoices' as const, label: 'Invoices & payments', href: `${base}?view=invoices` }] : []),
  ]
  return (
    <nav aria-label="Financials views" className="-mb-2 overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1">
        {items.map((item) => {
          const active = item.view === current
          return (
            <li key={item.view}>
              <Link
                href={item.href}
                scroll={false}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors',
                  active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
