import { formatLongDate, greeting } from '@/lib/greeting'

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
    <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className="h-px w-5 bg-champagne" aria-hidden="true" />
          <time dateTime={today}>{formatLongDate(today)}</time>
        </p>
        <h1 className="text-pretty font-serif text-2xl font-semibold leading-tight text-foreground md:text-[1.75rem]">
          {hello}
          {summary && (
            <>
              {' '}
              <span className="text-primary">{summary}</span>
            </>
          )}
        </h1>
      </div>
    </header>
  )
}
