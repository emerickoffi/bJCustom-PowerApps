import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Accent = 'primary' | 'champagne' | 'warning' | 'danger' | 'neutral'

const ACCENT: Record<Accent, string> = {
  primary: 'bg-sage text-primary',
  champagne: 'bg-champagne-soft text-champagne-foreground',
  warning: 'bg-champagne-soft text-warning',
  danger: 'bg-destructive/8 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
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
  value: number | string
  href: string
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  accent?: Accent
}) {
  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}${hint ? `. ${hint}` : ''}. View details.`}
      className="group surface flex flex-col gap-4 p-5 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span className={cn('flex size-9 items-center justify-center rounded-lg', ACCENT[accent])} aria-hidden="true">
            <Icon className="size-[1.125rem]" />
          </span>
        ) : (
          <span />
        )}
        <ArrowUpRight
          className="size-4 text-muted-foreground/50 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
          aria-hidden="true"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="tabular font-serif text-[2rem] font-semibold leading-none tracking-tight text-brand-deep">
          {value}
        </span>
        <span className="pt-1 text-sm font-medium text-foreground">{label}</span>
        {hint && <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>}
      </div>
    </Link>
  )
}
