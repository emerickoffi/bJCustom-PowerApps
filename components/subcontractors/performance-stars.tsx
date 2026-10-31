import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRating, ratingCountLabel, type PerformanceSummary } from '@/lib/subcontractor-performance'

/** Read-only 5-star display with partial fill for fractional averages. */
export function StarDisplay({ value, className }: { value: number | null; className?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / 5) * 100))
  return (
    <span
      role="img"
      aria-label={value === null ? 'Not rated' : `${formatRating(value)} out of 5 stars`}
      className={cn('relative inline-flex shrink-0', className)}
    >
      <span className="flex text-border" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="size-3.5 fill-current" />
        ))}
      </span>
      <span className="absolute inset-0 flex overflow-hidden text-amber-500" style={{ width: `${pct}%` }} aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Star key={i} className="size-3.5 shrink-0 fill-current" />
        ))}
      </span>
    </span>
  )
}

export function PerformanceCell({ summary }: { summary: PerformanceSummary | undefined }) {
  if (!summary || summary.average === null) return <span className="text-sm text-muted-foreground/80">Not rated</span>
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center gap-1.5">
        <StarDisplay value={summary.average} />
        <span className="text-sm font-semibold tabular-nums text-foreground">{formatRating(summary.average)}</span>
      </span>
      <span className="text-xs text-muted-foreground">{ratingCountLabel(summary.count)}</span>
    </div>
  )
}
