import { cn } from '@/lib/utils'
import { SUBCONTRACTOR_STATUS_LABELS, type SubcontractorStatus } from '@/lib/subcontractors'

export function SubcontractorStatusBadge({ status, className }: { status: SubcontractorStatus; className?: string }) {
  const active = status === 'active'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', active ? 'bg-primary' : 'bg-muted-foreground/60')} aria-hidden="true" />
      {SUBCONTRACTOR_STATUS_LABELS[status]}
    </span>
  )
}
