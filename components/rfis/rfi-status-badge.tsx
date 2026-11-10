import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { RFI_STATUS_LABELS, type RfiStatus } from '@/lib/rfis'

const TONES: Record<RfiStatus, SemanticTone> = {
  draft: 'neutral',
  open: 'info',
  answered: 'pending',
  closed: 'success',
}

export function RfiStatusBadge({ status, overdue = false, className }: { status: RfiStatus; overdue?: boolean; className?: string }) {
  if (status === 'open' && overdue) {
    return (
      <SemanticBadge tone="danger" className={className}>
        Open · overdue
      </SemanticBadge>
    )
  }
  return (
    <SemanticBadge tone={TONES[status]} className={className}>
      {RFI_STATUS_LABELS[status]}
    </SemanticBadge>
  )
}
