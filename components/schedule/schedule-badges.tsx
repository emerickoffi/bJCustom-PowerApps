import { AlertCircle, CheckCircle2, CircleDashed, LoaderCircle, MinusCircle, PauseCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACTIVITY_STATUS_LABELS, type ActivityStatus } from '@/lib/schedule'

const STATUS_STYLE: Record<ActivityStatus, { tone: string; icon: LucideIcon }> = {
  not_started: { tone: 'border-[#D8E0E8] bg-[#E9EDF2] text-[#526174]', icon: CircleDashed },
  in_progress: { tone: 'border-[#C9DFFF] bg-[#E6F0FF] text-[#1D5FBD]', icon: LoaderCircle },
  completed: { tone: 'border-[#C2E4D0] bg-[#E2F3E9] text-[#187542]', icon: CheckCircle2 },
  delayed: { tone: 'border-[#F5C7C5] bg-[#FDE8E7] text-[#BD302B]', icon: AlertCircle },
  on_hold: { tone: 'border-[#F5C7C5] bg-[#FDE8E7] text-[#BD302B]', icon: PauseCircle },
  skipped: { tone: 'border-border bg-secondary text-secondary-foreground', icon: MinusCircle },
}

export const STATUS_BAR_TONE: Record<ActivityStatus, string> = {
  not_started: 'bg-[#526174]/35',
  in_progress: 'bg-[#2778F5]',
  completed: 'bg-[#008C4A]',
  delayed: 'bg-[#BD302B]',
  on_hold: 'bg-[#BD302B]',
  skipped: 'bg-muted-foreground/30',
}

export function ActivityStatusBadge({ status, className }: { status: ActivityStatus; className?: string }) {
  const { tone, icon: Icon } = STATUS_STYLE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {ACTIVITY_STATUS_LABELS[status]}
    </span>
  )
}

function fillTone(status: ActivityStatus | undefined, overdue: boolean) {
  if (!status) return 'bg-primary'
  if (overdue && status !== 'completed' && status !== 'skipped') return 'bg-[#BD302B]'
  if (status === 'completed') return 'bg-[#008C4A]'
  if (status === 'delayed' || status === 'on_hold') return 'bg-[#BD302B]'
  return 'bg-[#2778F5]'
}

export function ProgressBar({
  value,
  label,
  className,
  status,
  overdue = false,
}: {
  value: number
  label: string
  className?: string
  status?: ActivityStatus
  overdue?: boolean
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E9EDF2]"
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {pct > 0 && <div className={cn('h-full rounded-full', fillTone(status, overdue))} style={{ width: `${pct}%` }} />}
      </div>
      <span className={cn('w-9 shrink-0 text-right text-xs font-medium tabular-nums', pct === 0 ? 'text-muted-foreground' : 'text-foreground')}>{`${pct}%`}</span>
    </div>
  )
}
