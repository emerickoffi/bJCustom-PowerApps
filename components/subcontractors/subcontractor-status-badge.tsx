import { cn } from '@/lib/utils'
import { SUBCONTRACTOR_STATUS_LABELS, type SubcontractorStatus } from '@/lib/subcontractors'
import { ActiveStatusBadge } from '@/components/shared/semantic-badge'

export function SubcontractorStatusBadge({ status, className }: { status: SubcontractorStatus; className?: string }) {
  if (status === 'active') {
    return <ActiveStatusBadge className={className}>{SUBCONTRACTOR_STATUS_LABELS[status]}</ActiveStatusBadge>
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
      {SUBCONTRACTOR_STATUS_LABELS[status]}
    </span>
  )
}
