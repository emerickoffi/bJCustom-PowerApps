import { CheckCircle2, Circle, CircleDot, XCircle } from 'lucide-react'
import type { EstimateStatus } from '@/lib/estimates'
import { SIGNATURE_STATUS_LABELS, type SignatureSummary } from '@/lib/signatures'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

type StepState = 'todo' | 'active' | 'done' | 'failed'

const ICONS = { todo: Circle, active: CircleDot, done: CheckCircle2, failed: XCircle } as const
const TONES: Record<StepState, string> = {
  todo: 'text-muted-foreground',
  active: 'text-warning',
  done: 'text-primary',
  failed: 'text-destructive',
}

function Step({ label, value, detail, state }: { label: string; value: string; detail?: string; state: StepState }) {
  const Icon = ICONS[state]
  return (
    <li className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3">
      <Icon className={cn('mt-0.5 size-5 shrink-0', TONES[state])} aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="truncate text-sm font-semibold text-foreground">{value}</span>
        {detail && <span className="truncate text-xs text-muted-foreground">{detail}</span>}
      </div>
    </li>
  )
}

/** Separates the three things users confuse: internal submission, client signature, and recorded approval. */
export function EstimateStatusStrip({
  status,
  submittedAt,
  decisionAt,
  signature,
  nextStep,
}: {
  status: EstimateStatus
  submittedAt: string | null
  decisionAt: string | null
  signature: SignatureSummary | null
  nextStep: string
}) {
  const submitted = status === 'submitted' || status === 'approved' || status === 'rejected'
  const submission = submitted
    ? { value: 'Sent to client', detail: submittedAt ? formatDate(submittedAt) : undefined, state: 'done' as const }
    : status === 'internal_review'
      ? { value: 'In internal review', detail: 'Not yet sent to client', state: 'active' as const }
      : { value: 'Draft', detail: 'Not yet sent to client', state: 'todo' as const }

  const sig = !signature
    ? { value: 'Not requested', detail: undefined, state: 'todo' as const }
    : {
        value: SIGNATURE_STATUS_LABELS[signature.status],
        detail: `${signature.signed} of ${signature.total} signed`,
        state:
          signature.status === 'completed'
            ? ('done' as const)
            : ['declined', 'cancelled', 'expired', 'failed'].includes(signature.status)
              ? ('failed' as const)
              : ('active' as const),
      }

  const approval =
    status === 'approved'
      ? { value: 'Approved', detail: decisionAt ? formatDate(decisionAt) : undefined, state: 'done' as const }
      : status === 'rejected'
        ? { value: 'Rejected', detail: decisionAt ? formatDate(decisionAt) : undefined, state: 'failed' as const }
        : submitted
          ? { value: 'Awaiting decision', detail: undefined, state: 'active' as const }
          : { value: 'Not started', detail: undefined, state: 'todo' as const }

  return (
    <section aria-label="Estimate progress" className="surface flex flex-col overflow-hidden">
      <ol className="flex flex-col divide-y md:flex-row md:divide-x md:divide-y-0">
        <Step label="Submission" {...submission} />
        <Step label="Client signature" {...sig} />
        <Step label="Approval" {...approval} />
      </ol>
      <p className="border-t bg-sage/40 px-4 py-2.5 text-sm text-foreground">
        <span className="font-semibold">{'Next step: '}</span>
        {nextStep}
      </p>
    </section>
  )
}
