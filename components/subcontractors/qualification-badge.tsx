import { cn } from '@/lib/utils'
import { qualificationBadge, type BadgeTone, type QualificationSummary } from '@/lib/subcontractor-qualification'

export const BADGE_TONES: Record<BadgeTone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-muted text-muted-foreground', dot: 'bg-muted-foreground/60' },
  info: { chip: 'bg-sky-500/10 text-sky-800 dark:text-sky-300', dot: 'bg-sky-600' },
  warning: { chip: 'bg-warning/15 text-warning-foreground', dot: 'bg-warning' },
  success: { chip: 'bg-emerald-600/10 text-emerald-800 dark:text-emerald-300', dot: 'bg-emerald-600' },
  danger: { chip: 'bg-destructive/10 text-destructive', dot: 'bg-destructive' },
}

export function QualificationBadge({
  summary,
  className,
}: {
  summary: Partial<Pick<QualificationSummary, 'status' | 'vetting_status'>> | null
  className?: string
}) {
  const { label, tone } = qualificationBadge(summary)
  return <ToneBadge label={label} tone={tone} srPrefix="Qualification: " className={className} />
}

export function ToneBadge({
  label,
  tone,
  srPrefix,
  className,
}: {
  label: string
  tone: BadgeTone
  srPrefix?: string
  className?: string
}) {
  const t = BADGE_TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        t.chip,
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', t.dot)} aria-hidden="true" />
      {srPrefix && <span className="sr-only">{srPrefix}</span>}
      {label}
    </span>
  )
}
