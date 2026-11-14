import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { RFI_PRIORITY_LABELS, type RfiPriority } from '@/lib/rfis'

const TONES: Record<RfiPriority, SemanticTone> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'orange',
  urgent: 'danger',
}

/** Always shows the label, so priority never depends on color alone. */
export function RfiPriorityBadge({ priority, className }: { priority: RfiPriority; className?: string }) {
  return (
    <SemanticBadge tone={TONES[priority]} className={className}>
      <span className="sr-only">Priority: </span>
      {RFI_PRIORITY_LABELS[priority]}
    </SemanticBadge>
  )
}
