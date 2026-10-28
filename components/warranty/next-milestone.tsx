import { CalendarDays, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Warranty dates are calendar dates in the builder's local time, matching the rest of the app's reporting. */
const APP_TIME_ZONE = 'America/Chicago'

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
  return new Date(utcDay(isoDate)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function countdown(days: number): { label: string; tone: string } {
  if (days < 0) {
    const n = Math.abs(days)
    return { label: `${n} ${n === 1 ? 'day' : 'days'} overdue`, tone: 'bg-[#FBEAE9] text-[#BD302B]' }
  }
  if (days === 0) return { label: 'Due today', tone: 'bg-[#FBEAE9] text-[#BD302B]' }
  const label = `${days} ${days === 1 ? 'day' : 'days'} remaining`
  if (days <= 7) return { label, tone: 'bg-[#FBE7C6] text-[#7A440A]' }
  if (days <= 30) return { label, tone: 'bg-[#FDF3E1] text-[#96570E]' }
  return { label, tone: 'bg-[#EAF0E9] text-[#174D32]' }
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

  const reached = Boolean(milestone.reached_at)
  const status = reached ? { label: 'Reached', tone: 'bg-[#EAF0E9] text-[#174D32]' } : countdown(calendarDaysUntil(milestone.due_on))
  const StatusIcon = reached ? CheckCircle2 : Clock

  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <span className="text-pretty font-medium text-foreground">{milestone.coverage_name}</span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
        <time dateTime={milestone.due_on} className="tabular-nums">
          {formatLongDate(milestone.due_on)}
        </time>
      </span>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums', status.tone)}>
        <StatusIcon className="size-3 shrink-0" aria-hidden="true" />
        {status.label}
      </span>
    </span>
  )
}
