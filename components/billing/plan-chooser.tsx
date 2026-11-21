'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { choosePlanAction } from '@/app/actions/billing'
import { describePlanPrice, maxYearlySavingPercent, type BillingInterval, type PlanPrice } from '@/lib/billing-shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const HIGHLIGHTS: Record<string, string[]> = {
  starter: ['Schedule, estimates and selections', 'Change orders, invoices and progress draws', 'Documents and time tracking', 'Walkthroughs, punch list and warranty', 'Homeowner portal', 'Daily logs and project photos'],
  pro: ['Everything in Starter', 'E-signatures', 'RFIs', 'Subcontractors and client updates', 'AI essentials: daily briefing, RFI wording help, drafted client updates'],
  business: ['Everything in Professional', 'Unlimited team members', 'Full AI assistant: project chat, voice punch items, quote comparison, estimate drafting', 'Online payments and QuickBooks (coming soon)'],
}

export function PlanChooser({
  plans,
  currentPlan,
  currentInterval,
  subscribed,
  disabled,
}: {
  plans: PlanPrice[]
  currentPlan: string | null
  currentInterval: BillingInterval | null
  /** True when the company already pays; choosing switches plans instead of opening checkout. */
  subscribed: boolean
  disabled?: boolean
}) {
  const [interval, setInterval] = useState<BillingInterval>(currentInterval ?? 'month')
  const yearlySaving = maxYearlySavingPercent(plans)
  const [pendingPlan, setPendingPlan] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function choose(plan: PlanPrice) {
    setPendingPlan(plan.key)
    startTransition(async () => {
      const result = await choosePlanAction(plan.key, interval)
      setPendingPlan(null)
      if (result?.error) toast.error(result.error)
      else if (result?.success) toast.success(result.success)
    })
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Billing period" className="flex w-fit gap-1 rounded-full border border-border bg-muted/40 p-1 text-sm">
        {(['month', 'year'] as const).map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={interval === i}
            onClick={() => setInterval(i)}
            className={cn(
              'rounded-full px-4 py-1.5 font-medium transition-colors',
              interval === i ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {i === 'month' ? 'Monthly' : yearlySaving > 0 ? `Yearly · save up to ${yearlySaving}%` : 'Yearly'}
          </button>
        ))}
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = subscribed && plan.key === currentPlan && interval === currentInterval
          const cents = interval === 'month' ? plan.monthly_price_cents : plan.yearly_price_cents
          return (
            <li
              key={plan.key}
              className={cn('surface flex flex-col gap-4 p-5', plan.key === 'pro' && 'ring-2 ring-primary/40')}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                  {plan.key === 'pro' && <span className="rounded-badge bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Most popular</span>}
                </div>
                {plan.tagline && <p className="text-sm text-muted-foreground">{plan.tagline}</p>}
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-2xl font-semibold tabular-nums text-foreground">{describePlanPrice(plan, interval).headline}</p>
                {describePlanPrice(plan, interval).note && (
                  <p className="text-xs text-muted-foreground">{describePlanPrice(plan, interval).note}</p>
                )}
              </div>
              <ul className="flex flex-1 flex-col gap-1.5 text-sm text-foreground">
                <li className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  {plan.max_staff === null ? 'Unlimited team members' : `Up to ${plan.max_staff} team members`}
                </li>
                {(HIGHLIGHTS[plan.key] ?? []).map((h) => (
                  <li key={h} className="flex gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                    {h}
                  </li>
                ))}
                <li className="flex gap-2 text-muted-foreground">
                  <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Unlimited homeowners and projects
                </li>
              </ul>
              <Button
                onClick={() => choose(plan)}
                disabled={disabled || isCurrent || pendingPlan !== null || cents === null}
                variant={plan.key === 'pro' ? 'default' : 'outline'}
              >
                {isCurrent
                  ? 'Current plan'
                  : pendingPlan === plan.key
                    ? 'Opening…'
                    : subscribed
                      ? `Switch to ${plan.name}`
                      : `Choose ${plan.name}`}
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
