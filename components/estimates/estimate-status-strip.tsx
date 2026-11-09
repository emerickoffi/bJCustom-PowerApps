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
    <li className="flex min-w-0 items-center gap-2 px-3 py-2 sm:px-4">
      <Icon className={cn('size-4 shrink-0', TONES[state])} aria-hidden="true" />
      <span className="min-w-0 truncate text-sm">
        <span className="text-muted-foreground">{`${label}: `}</span>
        <span className="font-semibold text-foreground">{value}</span>
        {detail && <span className="text-muted-foreground">{` · ${detail}`}</span>}
      </span>
    </li>
  )
}

/** Keeps internal submission, client signature, and recorded approval independent — a signature is not an approval. */
export function EstimateStatusStrip({
  status,
  submittedAt,
  decisionAt,
  signature,
}: {
  status: EstimateStatus
  submittedAt: string | null
  decisionAt: string | null
  signature: SignatureSummary | null
}) {
  const submitted = status === 'submitted' || status === 'approved' || status === 'rejected'
  const submission = submitted
    ? { value: 'Locked for client', detail: submittedAt ? formatDate(submittedAt) : undefined, state: 'done' as const }
    : status === 'internal_review'
      ? { value: 'In internal review', state: 'active' as const }
      : { value: 'Draft', state: 'todo' as const }

  const sig = !signature
    ? { value: 'Not requested', state: 'todo' as const }
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
          ? { value: 'Awaiting decision', state: 'active' as const }
          : { value: 'Not started', state: 'todo' as const }

  return (
    <section aria-label="Estimate progress" className="surface overflow-hidden">
      <ol className="flex flex-col divide-y md:flex-row md:flex-wrap md:divide-x md:divide-y-0">
        <Step label="Submission" {...submission} />
        <Step label="Client signature" {...sig} />
        <Step label="Approval" {...approval} />
      </ol>
    </section>
  )
}
