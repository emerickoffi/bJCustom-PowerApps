import { CalendarDays } from 'lucide-react'
import { formatLongDate, formatShortDate, greeting } from '@/lib/greeting'

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
  const count = `${actionTotal}${actionTotalIsLowerBound ? '+' : ''}`
  const summary = !actionsAvailable
    ? null
    : actionTotal === 0
      ? 'You\u2019re up to date on your current action items.'
      : `${count} ${actionTotal === 1 && !actionTotalIsLowerBound ? 'thing needs' : 'things need'} your attention.`

  return (
    <header className="flex flex-col gap-1.5 border-b pb-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <h1 className="min-w-0 text-pretty font-serif text-2xl font-semibold leading-tight text-foreground md:text-[1.75rem]">
        {hello}
        {summary && (
          <>
            {' '}
            <span className="text-primary">{summary}</span>
          </>
        )}
      </h1>
      <p className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm text-muted-foreground">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        <time dateTime={today} title={formatLongDate(today)}>
          {formatShortDate(today)}
        </time>
      </p>
    </header>
  )
}
