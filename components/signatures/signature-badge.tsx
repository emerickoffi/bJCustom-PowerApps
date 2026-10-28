import { CheckCircle2, CircleAlert, Clock, PenLine, XCircle } from 'lucide-react'
import { SIGNATURE_STATUS_LABELS, type SignatureStatus } from '@/lib/signatures'
import { cn } from '@/lib/utils'

const TONES: Record<SignatureStatus, { className: string; Icon: typeof Clock }> = {
  draft: { className: 'bg-muted text-muted-foreground ring-border', Icon: Clock },
  awaiting_signatures: { className: 'bg-champagne-soft text-warning ring-warning/20', Icon: PenLine },
  partially_signed: { className: 'bg-champagne-soft text-warning ring-warning/20', Icon: PenLine },
  completed: { className: 'bg-[#EAF0E9] text-success ring-success/20', Icon: CheckCircle2 },
  declined: { className: 'bg-destructive/5 text-destructive ring-destructive/20', Icon: XCircle },
  cancelled: { className: 'bg-muted text-muted-foreground ring-border', Icon: XCircle },
  expired: { className: 'bg-muted text-muted-foreground ring-border', Icon: Clock },
  failed: { className: 'bg-destructive/5 text-destructive ring-destructive/20', Icon: CircleAlert },
}

export function SignatureBadge({ status, signed, total, className }: { status: SignatureStatus; signed?: number; total?: number; className?: string }) {
  const { className: tone, Icon } = TONES[status]
  const progress = total && status !== 'completed' && (status === 'awaiting_signatures' || status === 'partially_signed') ? ` · ${signed ?? 0}/${total}` : ''
  return (
    <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tone, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {`${SIGNATURE_STATUS_LABELS[status]}${progress}`}
    </span>
  )
}
