import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AnimatedNumber, type AnimatedNumberFormat } from '@/components/dashboard/animated-number'
import { KpiDetails } from '@/components/dashboard/kpi-details'

type Accent = 'primary' | 'link' | 'warning' | 'danger' | 'neutral'

const ACCENT: Record<Accent, string> = {
  primary: 'bg-sage text-primary',
  link: 'bg-link-soft text-link',
  warning: 'bg-champagne-soft text-warning',
  danger: 'bg-destructive/8 text-destructive',
  neutral: 'bg-muted text-muted-foreground',
}

export type StatTone = 'approval' | 'contract' | 'schedule' | 'receivables'

const TONE_ICON: Record<StatTone, string> = {
  approval: 'bg-attention-soft text-notification',
  contract: 'bg-info/10 text-info',
  schedule: 'bg-attention-soft text-notification',
  receivables: 'bg-link-soft text-link',
}

export type KpiEmphasis = 'pending' | 'attention' | 'danger' | 'muted'

const VALUE_COLOR: Record<KpiEmphasis, string> = {
  pending: 'text-notification',
  attention: 'text-attention-foreground',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
}

/** Compact dashboard KPI: icon, label and value, with supplementary detail behind an info popover. */
export function KpiCard({
  label,
  value,
  href,
  icon: Icon,
  tone,
  countTo,
  note,
  details,
  emphasis,
}: {
  label: string
  value: number | string
  href: string
  icon: React.ComponentType<{ className?: string }>
  tone: StatTone
  countTo?: { value: number; format: AnimatedNumberFormat }
  /** Qualification required to read the value correctly; always visible. */
  note?: string
  /** Supplementary explanation, shown in the details popover. */
  details?: readonly string[]
  emphasis?: KpiEmphasis
}) {
  return (
    <div className="group relative flex h-full min-h-20 items-center gap-3 rounded-[10px] border border-border bg-card px-4 py-3.5 shadow-[0_1px_2px_rgb(23_33_43/0.04)] transition-[border-color,box-shadow] duration-200 hover:border-link-border hover:shadow-soft has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2">
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', TONE_ICON[tone])} aria-hidden="true">
        <Icon className="size-[22px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={href}
          aria-label={`${label}: ${value}${note ? `. ${note}` : ''}. View details.`}
          className="text-[13px] font-medium leading-tight text-muted-foreground outline-none after:absolute after:inset-0 after:rounded-[10px] after:content-['']"
        >
          {label}
        </Link>
        <span
          className={cn(
            'tabular break-words text-[26px] font-bold leading-[1.1] tracking-tight',
            emphasis ? VALUE_COLOR[emphasis] : 'text-foreground',
          )}
        >
          {countTo ? <AnimatedNumber value={countTo.value} format={countTo.format} /> : value}
        </span>
        {note && <span className="text-xs leading-snug text-muted-foreground">{note}</span>}
      </div>
      {details && details.length > 0 && <KpiDetails label={label} details={details} />}
    </div>
  )
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
}) {
  const statusDot = STATUS_DOT[accent]

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}${subValue ? `. ${subValue}` : ''}${hint ? `. ${hint}` : ''}. View details.`}
      className="group surface flex h-full flex-col gap-3.5 p-5 transition-[border-color,box-shadow] duration-200 hover:border-primary/25 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 xl:p-6"
    >
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
      <div className="flex min-w-0 flex-col gap-1">
        <span className="tabular break-words font-serif text-[2rem] font-semibold leading-none tracking-tight text-foreground">
          {countTo ? <AnimatedNumber value={countTo.value} format={countTo.format} /> : value}
        </span>
        {subValue && <span className="tabular pt-1 text-sm font-medium text-muted-foreground">{subValue}</span>}
        <span className="pt-1.5 text-sm font-medium leading-snug text-foreground">{label}</span>
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
