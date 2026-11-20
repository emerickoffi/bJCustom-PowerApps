import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { TIME_STATUS_LABELS, addDaysIso, type TimeStatus } from '@/lib/time-tracking'
import { cn } from '@/lib/utils'

const TONE: Record<TimeStatus, string> = {
  open: 'bg-primary/10 text-primary ring-primary/20',
  pending: 'bg-champagne-soft text-foreground ring-warning/30',
  approved: 'bg-sage text-foreground ring-primary/15',
  rejected: 'bg-destructive/10 text-destructive ring-destructive/20',
}

export function TimeStatusBadge({ status }: { status: TimeStatus }) {
  return (
    <span className={cn('inline-flex w-fit items-center rounded-badge px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[status])}>
      {TIME_STATUS_LABELS[status]}
    </span>
  )
}

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...opts }).format(new Date(`${iso}T00:00:00Z`))

export function weekLabel(week: string) {
  const end = addDaysIso(week, 6)
  return `${fmt(week, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

export function dayLabel(isoDate: string) {
  return fmt(isoDate, { weekday: 'long', month: 'short', day: 'numeric' })
}

/** Previous / this week / next links that keep the other query parameters. */
export function WeekNav({ basePath, week, thisWeek, params = {} }: { basePath: string; week: string; thisWeek: string; params?: Record<string, string | undefined> }) {
  const href = (w: string) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
    if (w !== thisWeek) q.set('week', w)
    const s = q.toString()
    return s ? `${basePath}?${s}` : basePath
  }
  return (
    <nav aria-label="Week" className="flex items-center gap-1">
      <Link href={href(addDaysIso(week, -7))} className={buttonVariants({ variant: 'outline', size: 'icon' })} aria-label="Previous week">
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Link>
      <span className="min-w-44 px-2 text-center text-sm font-medium tabular-nums text-foreground">{weekLabel(week)}</span>
      <Link
        href={href(addDaysIso(week, 7))}
        aria-disabled={week >= thisWeek}
        className={cn(buttonVariants({ variant: 'outline', size: 'icon' }), week >= thisWeek && 'pointer-events-none opacity-40')}
        aria-label="Next week"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Link>
      {week !== thisWeek && (
        <Link href={href(thisWeek)} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
          This week
        </Link>
      )}
    </nav>
  )
}

export function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface flex flex-col gap-1 p-4">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}
