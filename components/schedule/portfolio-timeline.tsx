import Link from 'next/link'
import { STATUS_BAR_TONE } from '@/components/schedule/schedule-badges'
import { ACTIVITY_STATUS_LABELS, isOverdue, todayIso, type ScheduleActivity } from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type Row = { id: string; name: string; activities: ScheduleActivity[] }

const DAY = 86_400_000
const toTime = (iso: string) => new Date(`${iso}T00:00:00`).getTime()

export function PortfolioTimeline({ rows }: { rows: Row[] }) {
  const dated = rows
    .map((r) => ({ ...r, activities: r.activities.filter((a) => a.planned_start && a.planned_end) }))
    .filter((r) => r.activities.length > 0)

  if (dated.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
        No planned dates yet. Add planned start and finish dates to activities to see them on the timeline.
      </p>
    )
  }

  const starts = dated.flatMap((r) => r.activities.map((a) => toTime(a.planned_start!)))
  const ends = dated.flatMap((r) => r.activities.map((a) => toTime(a.planned_end!)))
  const min = Math.min(...starts)
  const max = Math.max(...ends) + DAY
  const span = Math.max(max - min, DAY)
  const pct = (t: number) => ((t - min) / span) * 100
  const today = toTime(todayIso())
  const todayPct = today >= min && today <= max ? pct(today) : null

  const months: { label: string; left: number }[] = []
  const cursor = new Date(min)
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() + 1)
  while (cursor.getTime() < max) {
    months.push({ label: cursor.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), left: pct(cursor.getTime()) })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-4">
        <div className="hidden w-48 shrink-0 md:block" />
        <div className="relative h-6 flex-1 border-b border-border">
          {months.map((m) => (
            <span key={m.left} className="absolute bottom-1 -translate-x-1/2 text-[11px] text-muted-foreground" style={{ left: `${m.left}%` }}>
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <ul className="flex flex-col">
        {dated.map((row) => (
          <li key={row.id} className="flex flex-col gap-1.5 border-b border-border/60 py-3 last:border-0 md:flex-row md:items-center md:gap-4">
            <Link
              href={`/projects/${row.id}/schedule`}
              className="w-48 shrink-0 truncate text-sm font-medium text-foreground hover:text-primary"
            >
              {row.name}
            </Link>
            <div className="relative h-7 flex-1 rounded bg-muted/50">
              {todayPct !== null && (
                <span aria-hidden="true" className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${todayPct}%` }} />
              )}
              {row.activities.map((a) => {
                const left = pct(toTime(a.planned_start!))
                const width = Math.max(pct(toTime(a.planned_end!) + DAY) - left, 0.6)
                const late = isOverdue(a)
                return (
                  <span
                    key={a.id}
                    title={`${a.name}: ${formatDate(a.planned_start!)} – ${formatDate(a.planned_end!)} · ${ACTIVITY_STATUS_LABELS[a.status]}${late ? ' · Overdue' : ''}`}
                    className={cn(
                      'absolute top-1 h-5 rounded-sm opacity-90',
                      STATUS_BAR_TONE[a.status],
                      late && 'ring-2 ring-destructive ring-offset-1 ring-offset-card',
                    )}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                )
              })}
            </div>
          </li>
        ))}
      </ul>
      {todayPct !== null && (
        <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span aria-hidden="true" className="inline-block h-3 w-px bg-destructive/70" /> Today
        </p>
      )}
    </div>
  )
}
