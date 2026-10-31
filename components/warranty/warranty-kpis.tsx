import Link from 'next/link'
import { AlertTriangle, ClipboardList, Hourglass, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WarrantyKpi = {
  key: string
  label: string
  value: number | null
  hint: string
  href: string
  tone: 'neutral' | 'pending' | 'danger'
}

const ICONS = { homes: Home, claims: ClipboardList, expiring: Hourglass, overdue: AlertTriangle } as const

const TONE: Record<WarrantyKpi['tone'], string> = {
  neutral: 'text-primary bg-[#EAF0E9]',
  pending: 'text-[#96570E] bg-[#FFF2DA]',
  danger: 'text-[#BD302B] bg-[#FDE8E7]',
}

export function WarrantyKpis({ items }: { items: WarrantyKpi[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Warranty summary">
      {items.map((k) => {
        const Icon = ICONS[k.key as keyof typeof ICONS] ?? Home
        const unavailable = k.value === null
        const active = !unavailable && k.value! > 0
        return (
          <li key={k.key}>
            <Link
              href={k.href}
              className="surface group flex h-full items-start gap-3 p-4 transition-colors hover:bg-[#F8F7F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg',
                  active ? TONE[k.tone] : 'bg-muted text-muted-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-medium text-muted-foreground">{k.label}</span>
                <span className="font-serif text-2xl font-semibold tabular-nums leading-tight text-foreground">
                  {unavailable ? '—' : k.value}
                </span>
                <span className="text-pretty text-xs text-muted-foreground">{unavailable ? 'Data unavailable' : k.hint}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
