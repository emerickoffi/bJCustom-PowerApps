import { Gem, Users } from 'lucide-react'
import { seatUsage, type PlanSummary } from '@/lib/plans-shared'
import { cn } from '@/lib/utils'

/** The company's plan and team seats, shown to its own staff. Plans are changed by Trefort. */
export function PlanSummaryCard({ plan, className }: { plan: PlanSummary; className?: string }) {
  const seats = seatUsage(plan)
  return (
    <section
      aria-label="Your plan"
      className={cn('surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5', className)}
    >
      <div className="flex items-start gap-3">
        <Gem className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-foreground">
            {plan.plan_name} plan
          </p>
          <p className="text-sm text-muted-foreground">
            {plan.all_features ? 'Every module is included.' : 'Modules outside your plan are shown with a lock.'} To change plans,
            contact Trefort.
          </p>
        </div>
      </div>
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm',
          seats.full ? 'font-medium text-champagne-foreground' : 'text-muted-foreground',
        )}
      >
        <Users className="size-4 shrink-0" aria-hidden="true" />
        {seats.label}
        {seats.full && ' · team is full'}
      </p>
    </section>
  )
}
