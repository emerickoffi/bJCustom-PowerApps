import { cn } from '@/lib/utils'
import { ACTIVITY_STATUS_LABELS, type ActivityStatus } from '@/lib/schedule'

const TONE: Record<ActivityStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-accent text-accent-foreground',
  completed: 'bg-primary/15 text-primary',
  delayed: 'bg-destructive/10 text-destructive',
  on_hold: 'bg-warning/15 text-warning-foreground',
  skipped: 'bg-secondary text-secondary-foreground',
}

export const STATUS_BAR_TONE: Record<ActivityStatus, string> = {
  not_started: 'bg-muted-foreground/30',
  in_progress: 'bg-primary/60',
  completed: 'bg-primary',
  delayed: 'bg-destructive',
  on_hold: 'bg-warning',
  skipped: 'bg-muted',
}

export function ActivityStatusBadge({ status, className }: { status: ActivityStatus; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', TONE[status], className)}
    >
      {ACTIVITY_STATUS_LABELS[status]}
    </span>
  )
}

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 rounded-full bg-muted"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums text-foreground">{`${pct}%`}</span>
    </div>
  )
}
