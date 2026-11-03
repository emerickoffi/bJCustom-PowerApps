import type { ReactNode } from 'react'
import { ArrowRight, CalendarDays, CircleAlert, CircleCheck } from 'lucide-react'
import { formatLongDate, formatShortDate, greeting } from '@/lib/greeting'
import { cn } from '@/lib/utils'

export function CommandHeader({
  firstName,
  today,
  actionTotal,
  actionTotalIsLowerBound,
  actionsAvailable,
  actionsHref = '#action-center-heading',
  weather,
  compact = false,
  showAttention = true,
}: {
  /** Standard layout moves the attention summary into the work-scope toolbar when that toolbar is shown. */
  showAttention?: boolean
  /** Tablet Home: a short carded header so work appears without scrolling. */
  compact?: boolean
  /** Compact jobsite weather shown under the greeting. */
  weather?: ReactNode
  firstName: string | null
  today: string
  actionTotal: number
  actionTotalIsLowerBound: boolean
  actionsAvailable: boolean
  /** Where the attention summary links; the full Actions page when the Action Center is hidden. */
  actionsHref?: string
}) {
  const hello = firstName ? `${greeting()}, ${firstName}.` : `${greeting()}.`
  const attentionSummary =
    showAttention && actionsAvailable ? (
      <AttentionSummary total={actionTotal} isLowerBound={actionTotalIsLowerBound} href={actionsHref} />
    ) : null

  if (!compact) {
    return (
      <header className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between md:gap-6">
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
        {(weather || attentionSummary) && (
          <div className="flex min-w-0 flex-col items-start gap-2 md:items-end">
            {weather}
            {attentionSummary}
          </div>
        )}
      </header>
    )
  }

  return (
    <header
      className={cn(
        'flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6',
        compact
          ? 'gap-3 rounded-2xl border border-l-4 border-l-interactive bg-card px-4 py-3 shadow-xs'
          : 'gap-4 border-b pb-4',
      )}
    >
      <div className={cn('flex min-w-0 flex-col', compact ? 'gap-0.5' : 'gap-1')}>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <time dateTime={today} title={formatLongDate(today)}>
            {formatShortDate(today)}
          </time>
        </p>
        <h1
          className={cn(
            'text-balance font-serif font-semibold leading-tight tracking-tight text-foreground',
            compact ? 'text-xl' : 'text-2xl md:text-[1.75rem]',
          )}
        >
          {hello}
        </h1>
        {!compact && (
          <p className="text-pretty text-sm text-muted-foreground">
            {'Here\u2019s what\u2019s happening across your projects today.'}
          </p>
        )}
        {weather && <div className="mt-1.5 self-start">{weather}</div>}
      </div>

      {actionsAvailable && (
        <AttentionSummary total={actionTotal} isLowerBound={actionTotalIsLowerBound} href={actionsHref} />
      )}
    </header>
  )
}

/** Compact one-line attention action for the standard dashboard's work-scope toolbar. */
export function AttentionToolbarAction({
  total,
  isLowerBound,
  href,
  scopeLabel,
}: {
  total: number
  isLowerBound: boolean
  href: string
  /** Names the work scope the count reflects, e.g. "in My work" or "across all work". */
  scopeLabel: string
}) {
  const caughtUp = total === 0
  const count = `${total}${isLowerBound ? '+' : ''}`
  const label = total === 1 && !isLowerBound ? 'item needs attention' : 'items need attention'

  if (caughtUp) {
    return (
      <a
        href={href}
        aria-label={`All caught up ${scopeLabel}. Go to your action items`}
        className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary transition-colors hover:bg-sage/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
        <span className="whitespace-nowrap">All caught up</span>
      </a>
    )
  }

  return (
    <a
      href={href}
      aria-label={`${count} ${label} ${scopeLabel}. Go to your action items`}
      className="group flex min-h-11 items-center gap-2 rounded-lg border border-[#FDBA74] bg-[#FFF1E6] py-1.5 pl-2 pr-3 text-sm text-[#B54708] transition-colors hover:bg-[#FFEDD5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2410C] focus-visible:ring-offset-2"
    >
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex min-w-7 items-center justify-center rounded-md bg-[#C2410C] px-1.5 py-0.5 text-xs font-bold tabular-nums text-white">
        {count}
      </span>
      <span className="whitespace-nowrap font-medium">{label}</span>
      <ArrowRight
        className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        aria-hidden="true"
      />
    </a>
  )
}

export function AttentionSummary({ total, isLowerBound, href }: { total: number; isLowerBound: boolean; href: string }) {
  const caughtUp = total === 0
  const count = `${total}${isLowerBound ? '+' : ''}`
  const label = total === 1 && !isLowerBound ? 'Needs your attention' : 'Need your attention'
  const Icon = caughtUp ? CircleCheck : CircleAlert

  return (
    <a
      href={href}
      aria-label={
        caughtUp
          ? 'All caught up. Go to your action items'
          : `${count} items need your attention. Go to your action items`
      }
      className="group flex shrink-0 items-center gap-3 self-start rounded-xl border border-[#D6DDE5] bg-card px-3.5 py-2.5 transition-colors hover:border-primary/40 hover:bg-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:self-auto"
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          caughtUp ? 'bg-sage text-primary' : 'bg-[#F7EDD7] text-[#8A5D12]',
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
