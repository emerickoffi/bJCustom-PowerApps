import { CheckCircle2, CircleDashed, Clock, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BUILDER_STATE_LABELS, WORK_STATE_LABELS, type WorkState } from '@/lib/subcontractor-work'

const STYLES: Record<WorkState, string> = {
  in_progress: 'border-border bg-muted text-muted-foreground',
  submitted: 'border-amber-300 bg-amber-50 text-amber-900',
  correction_required: 'border-destructive/30 bg-destructive/10 text-destructive',
  accepted: 'border-primary/30 bg-primary/10 text-primary',
}

const ICONS = { in_progress: CircleDashed, submitted: Clock, correction_required: RotateCcw, accepted: CheckCircle2 }

export function WorkStateBadge({ state, audience = 'sub', className }: { state: WorkState; audience?: 'sub' | 'builder'; className?: string }) {
  const Icon = ICONS[state]
  const label = audience === 'builder' ? BUILDER_STATE_LABELS[state] : WORK_STATE_LABELS[state]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        STYLES[state],
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
