import { CalendarDays, CircleAlert, CircleCheck } from 'lucide-react'
import { formatLongDate, formatShortDate, greeting } from '@/lib/greeting'
import { cn } from '@/lib/utils'

export function CommandHeader({
  firstName,
  today,
  actionTotal,
  actionTotalIsLowerBound,
  actionsAvailable,
}: {
  firstName: string | null
  today: string
  actionTotal: number
  actionTotalIsLowerBound: boolean
  actionsAvailable: boolean
}) {
  const hello = firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`

  return (
    <header className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <time dateTime={today} title={formatLongDate(today)}>
            {formatShortDate(today)}
          </time>
        </p>
        <h1 className="text-balance font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-[1.75rem]">
          {hello}
        </h1>
        <p className="text-pretty text-sm text-muted-foreground">
          {'Here\u2019s what\u2019s happening across your projects today.'}
        </p>
      </div>

      {actionsAvailable && (
        <AttentionSummary total={actionTotal} isLowerBound={actionTotalIsLowerBound} />
      )}
    </header>
  )
}

function AttentionSummary({ total, isLowerBound }: { total: number; isLowerBound: boolean }) {
  const caughtUp = total === 0
  const count = `${total}${isLowerBound ? '+' : ''}`
  const label = total === 1 && !isLowerBound ? 'Needs your attention' : 'Need your attention'
  const Icon = caughtUp ? CircleCheck : CircleAlert

  return (
    <a
      href="#action-center-heading"
      aria-label={caughtUp ? 'All caught up. Go to Action Center' : `${count} items need your attention. Go to Action Center`}
      className="group flex shrink-0 items-center gap-3 self-start rounded-xl border bg-card px-3.5 py-2.5 transition-colors hover:border-primary/40 hover:bg-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:self-auto"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          caughtUp ? 'bg-sage text-primary' : 'bg-champagne/30 text-foreground',
        )}
        aria-hidden="true"
      >
        <Icon className="size-[18px]" />
      </span>
      {caughtUp ? (
        <span className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-foreground">All caught up</span>
          <span className="text-xs text-muted-foreground">Nothing waiting on you</span>
        </span>
      ) : (
        <span className="flex items-center gap-2.5">
          <span className="font-serif text-2xl font-semibold leading-none tabular-nums text-primary">{count}</span>
          <span className="flex flex-col leading-tight">
            <span className="whitespace-nowrap text-sm font-medium text-foreground">{label}</span>
            <span className="text-xs text-muted-foreground group-hover:text-primary">Items to review</span>
          </span>
        </span>
      )}
    </a>
  )
}
