import { CheckCircle2 } from 'lucide-react'
import { APP_TIME_ZONE, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export type NextMilestoneData = {
  coverage_name: string
  due_on: string
  reached_at?: string | null
}

function todayInAppZone(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function utcDay(isoDate: string): number {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Whole calendar days between today (app time zone) and the due date. UTC midnights avoid DST and offset drift. */
export function calendarDaysUntil(isoDate: string): number {
  return Math.round((utcDay(isoDate) - utcDay(todayInAppZone())) / 86_400_000)
}

function formatLongDate(isoDate: string): string {
  return new Date(utcDay(isoDate)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** Coverage periods are dates, not tasks: describe when they end rather than calling them due or overdue. */
function remaining(days: number): { label: string; tone: string } {
  const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`
  if (days < 0) return { label: `Ended ${plural(Math.abs(days))} ago`, tone: 'text-muted-foreground' }
  if (days === 0) return { label: 'Ends today', tone: 'text-[#96570E]' }
  if (days <= 30) return { label: `${plural(days)} left`, tone: 'text-[#96570E]' }
  return { label: `${plural(days)} left`, tone: 'text-muted-foreground' }
}

export function NextMilestone({ milestone }: { milestone: NextMilestoneData | null }) {
  if (!milestone) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
        All periods ended
      </span>
    )
  }

  const status = milestone.reached_at
    ? { label: 'Period ended', tone: 'text-muted-foreground' }
    : remaining(calendarDaysUntil(milestone.due_on))

  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium text-foreground">{milestone.coverage_name}</span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <time dateTime={milestone.due_on} title={formatLongDate(milestone.due_on)} className="tabular-nums text-muted-foreground">
          {formatDate(milestone.due_on)}
        </time>
        <span aria-hidden="true" className="text-muted-foreground">
          ·
        </span>
        <span className={cn('tabular-nums', status.tone, status.tone !== 'text-muted-foreground' && 'font-medium')}>
          {status.label}
        </span>
      </span>
    </span>
  )
}
