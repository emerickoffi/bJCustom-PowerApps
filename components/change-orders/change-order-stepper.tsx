import { Ban, Check, X } from 'lucide-react'
import type { ChangeOrderStatus } from '@/lib/change-orders'
import { cn } from '@/lib/utils'

type StepState = 'complete' | 'current' | 'upcoming' | 'declined' | 'skipped'

type Step = { key: string; label: string; detail: string; state: StepState }

/** Display-only: "Applied" reflects that approved change orders flow into project financials; it is not a status. */
function buildSteps(status: ChangeOrderStatus): Step[] {
  const order: ChangeOrderStatus[] = ['draft', 'internal_review', 'awaiting_homeowner']
  const reached = status === 'approved' || status === 'rejected' ? 3 : order.indexOf(status)
  const at = (i: number): StepState => (i < reached ? 'complete' : i === reached ? 'current' : 'upcoming')

  return [
    { key: 'draft', label: 'Draft', detail: 'Scope and pricing', state: at(0) },
    { key: 'internal_review', label: 'Internal review', detail: 'Team check', state: at(1) },
    { key: 'awaiting_homeowner', label: 'Sent to homeowner', detail: 'Awaiting decision', state: at(2) },
    {
      key: 'decision',
      label: status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Approved / Declined',
      detail: status === 'approved' ? 'Homeowner accepted' : status === 'rejected' ? 'Homeowner declined' : 'Homeowner decision',
      state: status === 'approved' ? 'complete' : status === 'rejected' ? 'declined' : 'upcoming',
    },
    {
      key: 'applied',
      label: 'Applied',
      detail: status === 'approved' ? 'In project budget' : status === 'rejected' ? 'Not applied' : 'Updates budget',
      state: status === 'approved' ? 'complete' : status === 'rejected' ? 'skipped' : 'upcoming',
    },
  ]
}

export function ChangeOrderStepper({ status }: { status: ChangeOrderStatus }) {
  if (status === 'void') {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
          <Ban className="size-4" />
        </span>
        This change order was voided. It stays on record and never affects the budget.
      </div>
    )
  }

  const steps = buildSteps(status)
  return (
    <ol aria-label="Change order workflow" className="grid grid-cols-1 gap-3 sm:grid-cols-5 sm:gap-0">
      {steps.map((step, i) => (
        <li
          key={step.key}
          aria-current={step.state === 'current' ? 'step' : undefined}
          className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2 sm:pr-4"
        >
          {i < steps.length - 1 && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-[calc(2rem+0.5rem)] right-2 top-4 hidden h-px sm:block',
                step.state === 'complete' ? 'bg-primary/50' : 'bg-border',
              )}
            />
          )}
          <span
            aria-hidden="true"
            className={cn(
              'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
              step.state === 'complete' && 'border-primary bg-primary text-primary-foreground',
              step.state === 'current' && 'border-warning bg-champagne-soft text-warning ring-4 ring-warning/10',
              step.state === 'upcoming' && 'border-border bg-card text-muted-foreground',
              step.state === 'declined' && 'border-destructive bg-destructive text-white',
              step.state === 'skipped' && 'border-dashed border-border bg-muted text-muted-foreground',
            )}
          >
            {step.state === 'complete' ? <Check className="size-4" /> : step.state === 'declined' ? <X className="size-4" /> : i + 1}
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                'text-sm font-medium',
                step.state === 'upcoming' || step.state === 'skipped' ? 'text-muted-foreground' : 'text-foreground',
                step.state === 'declined' && 'text-destructive',
              )}
            >
              {step.label}
            </span>
            <span className="text-xs text-muted-foreground">{step.detail}</span>
            <span className="sr-only">
              {step.state === 'complete' ? '(complete)' : step.state === 'current' ? '(current step)' : step.state === 'declined' ? '(declined)' : step.state === 'skipped' ? '(not applied)' : '(upcoming)'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  )
}
