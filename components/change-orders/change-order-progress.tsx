import { Check, X } from 'lucide-react'
import { CHANGE_ORDER_PROGRESS, CHANGE_ORDER_STATUS_LABELS, progressStates, type ChangeOrderStatus } from '@/lib/change-orders'
import { cn } from '@/lib/utils'

export function ChangeOrderProgress({ status }: { status: ChangeOrderStatus }) {
  const states = progressStates(status)
  const decisionLabel = status === 'approved' || status === 'rejected' ? CHANGE_ORDER_STATUS_LABELS[status] : 'Approved / Rejected'

  if (status === 'void') {
    return <p className="text-sm text-muted-foreground">This change order was voided. It stays on record and never affects the budget.</p>
  }

  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-4" aria-label="Approval progress">
      {CHANGE_ORDER_PROGRESS.map((step, i) => {
        const state = states[i]
        const rejected = step.key === 'decision' && status === 'rejected'
        const label = step.key === 'decision' ? decisionLabel : step.label
        return (
          <li key={step.key} className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
                state === 'complete' && !rejected && 'border-primary bg-primary text-primary-foreground',
                state === 'complete' && rejected && 'border-destructive bg-destructive text-white',
                state === 'current' && 'border-primary bg-sage text-primary',
                state === 'upcoming' && 'border-border bg-card text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {state === 'complete' ? rejected ? <X className="size-3.5" /> : <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-sm', state === 'upcoming' ? 'text-muted-foreground' : 'font-medium text-foreground')}>
              {label}
              <span className="sr-only">{state === 'complete' ? ' (complete)' : state === 'current' ? ' (current step)' : ' (upcoming)'}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
