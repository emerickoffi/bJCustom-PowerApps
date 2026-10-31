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
    card: 'bg-[#F8F0E2] border-[#EADDC7] hover:border-[#DCC9A8]',
    icon: 'bg-[#916D35]/12 text-[#916D35]',
  },
  contract: {
    card: 'bg-[#EAF3EC] border-[#D4E5D8] hover:border-[#B9D3C0]',
    icon: 'bg-[#3B7050]/12 text-[#3B7050]',
  },
  schedule: {
    card: 'bg-[#EEF1F7] border-[#DCE3EF] hover:border-[#C3CFE2]',
    icon: 'bg-[#60789A]/12 text-[#60789A]',
  },
  receivables: {
    card: 'bg-[#F2EEEA] border-[#E4DDD5] hover:border-[#D2C7BA]',
    icon: 'bg-[#846E5B]/12 text-[#846E5B]',
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
}: {
  label: string
  value: number | string
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
      aria-label={`${label}: ${value}${hint ? `. ${hint}` : ''}. View details.`}
      className={cn(
        'group surface flex h-full flex-col transition-[border-color,box-shadow] duration-200 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        toned ? cn('gap-2 p-[18px] xl:p-5', toned.card) : 'gap-3.5 p-5 hover:border-primary/25 xl:p-6',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {Icon ? (
          <span
            className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', toned ? toned.icon : ACCENT[accent])}
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
            className="size-4 text-muted-foreground/50 transition-[color,transform] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
            aria-hidden="true"
          />
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="tabular break-words font-serif text-[2rem] font-semibold leading-none tracking-tight text-brand-deep">
          {countTo ? <AnimatedNumber value={countTo.value} format={countTo.format} /> : value}
        </span>
        <span className={cn('text-sm font-medium leading-snug text-foreground', toned ? 'pt-1' : 'pt-1.5')}>{label}</span>
        {hint && (
          <span
            title={hint}
            className={cn('line-clamp-2 text-xs leading-normal', toned ? 'text-[#56655E]' : 'text-muted-foreground')}
          >
            {hint}
          </span>
        )}
      </div>
    </Link>
  )
}
