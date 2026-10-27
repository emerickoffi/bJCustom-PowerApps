import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Accent = 'primary' | 'champagne' | 'warning' | 'danger' | 'neutral'

const ACCENT: Record<Accent, { icon: string; bar: string }> = {
  primary: { icon: 'bg-sage text-primary', bar: 'bg-primary' },
  champagne: { icon: 'bg-champagne-soft text-champagne-foreground', bar: 'bg-champagne' },
  warning: { icon: 'bg-champagne-soft text-warning', bar: 'bg-warning' },
  danger: { icon: 'bg-destructive/8 text-destructive', bar: 'bg-destructive' },
  neutral: { icon: 'bg-muted text-muted-foreground', bar: 'bg-muted-foreground/40' },
}

export function StatCard({
  label,
  value,
  href,
  icon: Icon,
  hint,
  accent = 'primary',
}: {
  label: string
  value: number
  href: string
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  accent?: Accent
}) {
  const a = ACCENT[accent]
  return (
    <Link
      href={href}
      className="group surface relative flex flex-col gap-4 overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lift"
    >
      <span className={cn('absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100', a.bar)} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span className={cn('flex size-10 items-center justify-center rounded-xl', a.icon)}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : (
          <span />
        )}
        <ArrowUpRight
          className="size-4 text-muted-foreground/60 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="tabular font-serif text-4xl font-semibold leading-none tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
    </Link>
  )
}
