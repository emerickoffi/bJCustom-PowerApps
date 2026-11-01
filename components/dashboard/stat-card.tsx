import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedNumber, type AnimatedNumberFormat } from '@/components/dashboard/animated-number'

type Accent = 'primary' | 'champagne' | 'warning' | 'danger' | 'neutral'

const ACCENT: Record<Accent, string> = {
  primary: 'bg-sage text-primary',
  champagne: 'bg-champagne-soft text-champagne-foreground',
  warning: 'bg-champagne-soft text-warning',
  danger: 'bg-destructive/8 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

export type StatTone = 'approval' | 'contract' | 'schedule' | 'receivables'

const TONE: Record<StatTone, { card: string; icon: string }> = {
  approval: {
    card: 'bg-[#F7EEDC] border-[#E6D6B8] hover:border-[#CDB68C]',
    icon: 'bg-[#805B20]/12 text-[#805B20]',
  },
  contract: {
    card: 'bg-[#E5F0E8] border-[#CADDCF] hover:border-[#A6C4AE]',
    icon: 'bg-[#256345]/12 text-[#256345]',
  },
  schedule: {
    card: 'bg-[#E7EDF6] border-[#CDD8E8] hover:border-[#A9BBD6]',
    icon: 'bg-[#41618D]/12 text-[#41618D]',
  },
  receivables: {
    card: 'bg-[#EEEAE5] border-[#DBD3CA] hover:border-[#BFB2A4]',
    icon: 'bg-[#6B5848]/12 text-[#6B5848]',
  },
}

const STATUS_DOT: Partial<Record<Accent, string>> = {
  warning: 'bg-warning',
  danger: 'bg-destructive',
}

export function StatCard({
  label,
  value,
  href,
  icon: Icon,
  hint,
  accent = 'primary',
  tone,
  countTo,
  subValue,
}: {
  label: string
  value: number | string
  /** Secondary figure shown directly under the primary value. */
  subValue?: string
  /** Numeric source for an animated count-up; `value` stays the formatted final text. */
  countTo?: { value: number; format: AnimatedNumberFormat }
  href: string
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  accent?: Accent
  tone?: StatTone
}) {
  const toned = tone ? TONE[tone] : undefined
  const statusDot = toned ? STATUS_DOT[accent] : undefined

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}${subValue ? `. ${subValue}` : ''}${hint ? `. ${hint}` : ''}. View details.`}
      className={cn(
        'group surface flex h-full flex-col transition-[border-color,box-shadow] duration-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        toned ? cn('gap-3 p-[18px] xl:min-h-44 xl:p-5', toned.card) : 'gap-3.5 p-5 hover:border-primary/25 xl:p-6',
      )}
    >
      {toned ? (
        <div className="flex items-center gap-3">
          {Icon && (
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', toned.icon)} aria-hidden="true">
              <Icon className="size-5" />
            </span>
          )}
          <span className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">{label}</span>
          <span className="flex shrink-0 items-center gap-2 self-start">
            {statusDot && <span className={cn('size-2 rounded-full ring-2 ring-white/70', statusDot)} aria-hidden="true" />}
            <ArrowUpRight
              className="size-4 text-muted-foreground transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
              aria-hidden="true"
            />
          </span>
        </div>
      ) : (
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', ACCENT[accent])}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
        ) : (
          <span />
        )}
        <span className="flex items-center gap-2">
          {statusDot && <span className={cn('size-2 rounded-full ring-2 ring-white/70', statusDot)} aria-hidden="true" />}
          <ArrowUpRight
            className="size-4 text-muted-foreground transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden="true"
          />
        </span>
      </div>
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <span className="tabular break-words font-serif text-[2rem] font-semibold leading-none tracking-tight text-foreground">
          {countTo ? <AnimatedNumber value={countTo.value} format={countTo.format} /> : value}
        </span>
        {subValue && <span className="tabular pt-1 text-sm font-medium text-muted-foreground">{subValue}</span>}
        {!toned && <span className="pt-1.5 text-sm font-medium leading-snug text-foreground">{label}</span>}
        {hint && (
          <span
            title={hint}
            className={cn('line-clamp-2 text-xs leading-normal', 'text-muted-foreground')}
          >
            {hint}
          </span>
        )}
      </div>
    </Link>
  )
}
