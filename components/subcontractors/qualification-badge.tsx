import { cn } from '@/lib/utils'
import { qualificationBadge, type BadgeTone, type QualificationSummary } from '@/lib/subcontractor-qualification'

const TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  warning: { chip: 'bg-warning/15 text-warning-foreground', dot: 'bg-warning' },
  success: { chip: 'bg-primary/10 text-primary', dot: 'bg-primary' },
  danger: { chip: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
}

export function QualificationBadge({
  summary,
  className,
}: {
  summary: Pick<QualificationSummary, 'status' | 'mandatory_satisfied' | 'mandatory_total'> | null
  className?: string
}) {
  const { label, tone } = qualificationBadge(summary)
  const t = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        t.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', t.dot)} aria-hidden="true" />
      <span className="sr-only">Qualification: </span>
      {label}
    </span>
  )
}
