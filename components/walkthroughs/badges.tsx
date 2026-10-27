import { cn } from '@/lib/utils'
import {
  ISSUE_STATUS_LABELS,
  PRIORITY_LABELS,
  RESPONSE_LABELS,
  type IssuePriority,
  VALIDATION_LABELS,
  WALKTHROUGH_STATUS_LABELS,
  type HomeownerValidation,
  type IssueStatus,
  type ResponseValue,
  type WalkthroughStatus,
} from '@/lib/walkthroughs'

const base = 'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'

const WALKTHROUGH_TONE: Record<WalkthroughStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_progress: 'bg-accent text-accent-foreground',
  submitted: 'bg-primary/15 text-primary',
}

const ISSUE_TONE: Record<IssueStatus, string> = {
  open: 'bg-warning/15 text-warning-foreground',
  in_progress: 'bg-accent text-accent-foreground',
  resolved: 'bg-primary/15 text-primary',
  closed: 'bg-secondary text-secondary-foreground',
}

const RESPONSE_TONE: Record<ResponseValue, string> = {
  satisfactory: 'bg-primary/15 text-primary',
  needs_attention: 'bg-warning/15 text-warning-foreground',
  not_applicable: 'bg-muted text-muted-foreground',
}

const VALIDATION_TONE: Record<HomeownerValidation, string> = {
  pending: 'bg-muted text-muted-foreground',
  accepted: 'bg-primary/15 text-primary',
  rejected: 'bg-destructive/10 text-destructive',
}

export function WalkthroughStatusBadge({ status, className }: { status: WalkthroughStatus; className?: string }) {
  return <span className={cn(base, WALKTHROUGH_TONE[status], className)}>{WALKTHROUGH_STATUS_LABELS[status]}</span>
}

export function IssueStatusBadge({ status, className }: { status: IssueStatus; className?: string }) {
  return <span className={cn(base, ISSUE_TONE[status], className)}>{ISSUE_STATUS_LABELS[status]}</span>
}

export function ResponseBadge({ response }: { response: ResponseValue | null }) {
  if (!response) return <span className={cn(base, 'border border-dashed text-muted-foreground')}>No response</span>
  return <span className={cn(base, RESPONSE_TONE[response])}>{RESPONSE_LABELS[response]}</span>
}

const PRIORITY_TONE: Record<IssuePriority, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-secondary text-secondary-foreground',
  high: 'bg-warning/15 text-warning-foreground',
  critical: 'bg-destructive/10 text-destructive',
}

export function PriorityBadge({ priority, className }: { priority: IssuePriority; className?: string }) {
  return <span className={cn(base, PRIORITY_TONE[priority], className)}>{`${PRIORITY_LABELS[priority]} priority`}</span>
}

export function ValidationBadge({ value }: { value: HomeownerValidation }) {
  return <span className={cn(base, VALIDATION_TONE[value])}>{VALIDATION_LABELS[value]}</span>
}
