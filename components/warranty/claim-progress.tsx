import { AlertCircle, Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { claimProgress, nextClaimAction, type ClaimProgressInput } from '@/lib/warranty-coverage'

const OUTCOME_NOTE: Record<string, string> = {
  not_covered: 'Not covered — repair steps do not apply.',
  info_required: 'Information required before review can continue.',
  reopened: 'Reopened — the homeowner reported the repair is not resolved.',
}

export function ClaimProgress({ audience, ...input }: ClaimProgressInput & { audience: 'staff' | 'homeowner' }) {
  const { steps, outcome } = claimProgress(input)
  const next = nextClaimAction(input.status, input.homeowner_validation, audience)

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-[#F8F7F3] p-3 md:p-4">
      <ol className="flex flex-col gap-2 md:flex-row md:gap-0" aria-label="Claim progress">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2 md:flex-1 md:flex-col md:items-start md:gap-1.5">
            <div className="flex items-center md:w-full">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold',
                  s.state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  s.state === 'current' && 'border-primary bg-card text-primary ring-2 ring-primary/20',
                  s.state === 'attention' && 'border-[#C27A1A] bg-[#FFF2DA] text-[#96570E]',
                  s.state === 'upcoming' && 'border-[#D8E0E8] bg-card text-muted-foreground',
                  s.state === 'skipped' && 'border-dashed border-[#D8E0E8] bg-transparent text-muted-foreground',
                )}
                aria-hidden="true"
              >
                {s.state === 'complete' ? (
                  <Check className="size-3" />
                ) : s.state === 'attention' ? (
                  <AlertCircle className="size-3" />
                ) : s.state === 'skipped' ? (
                  <Minus className="size-3" />
                ) : (
                  i + 1
                )}
              </span>
              {i < steps.length - 1 && (
                <span
                  className={cn('mx-1 hidden h-px flex-1 md:block', s.state === 'complete' ? 'bg-primary' : 'bg-[#D8E0E8]')}
                  aria-hidden="true"
                />
              )}
            </div>
            <span
              className={cn(
                'text-xs leading-tight md:pr-2',
                s.state === 'current' || s.state === 'attention' ? 'font-medium text-foreground' : 'text-muted-foreground',
                s.state === 'skipped' && 'line-through',
              )}
            >
              {s.label}
              <span className="sr-only">{` (${s.state})`}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Next: </span>
        {next}
        {OUTCOME_NOTE[outcome] && <span className="ml-1 text-[#96570E]">{OUTCOME_NOTE[outcome]}</span>}
      </p>
    </div>
  )
}
