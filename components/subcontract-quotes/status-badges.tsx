import { cn } from '@/lib/utils'
import {
  DECISION_LABELS,
  REQUEST_STATUS_LABELS,
  RESPONSE_LABELS,
  type QuoteDecision,
  type RequestStatus,
  type ResponseState,
} from '@/lib/subcontract-quotes'

const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

const REQUEST_TONES: Record<RequestStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-primary/10 text-primary',
  closed: 'bg-secondary text-secondary-foreground',
  cancelled: 'bg-destructive/10 text-destructive',
  awarded: 'bg-success/15 text-success',
}

const DECISION_TONES: Record<QuoteDecision, string> = {
  selected: 'bg-success/15 text-success',
  not_selected: 'bg-muted text-muted-foreground',
  rejected: 'bg-destructive/10 text-destructive',
}

export function DecisionBadge({ decision }: { decision: QuoteDecision }) {
  return <span className={cn(pill, DECISION_TONES[decision])}>{DECISION_LABELS[decision]}</span>
}

const RESPONSE_TONES: Record<ResponseState, string> = {
  awaiting: 'bg-muted text-muted-foreground',
  submitted: 'bg-success/15 text-success',
  revision_requested: 'bg-warning/15 text-warning',
  declined: 'bg-destructive/10 text-destructive',
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return <span className={cn(pill, REQUEST_TONES[status])}>{REQUEST_STATUS_LABELS[status]}</span>
}

export function ResponseBadge({ state }: { state: ResponseState }) {
  return <span className={cn(pill, RESPONSE_TONES[state])}>{RESPONSE_LABELS[state]}</span>
}
