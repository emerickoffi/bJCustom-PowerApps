import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { ESTIMATE_STATUS_LABELS, type EstimateStatus } from '@/lib/estimates'

const ESTIMATE_SEMANTIC_TONE: Record<EstimateStatus, SemanticTone> = {
  draft: 'neutral',
  internal_review: 'info',
  submitted: 'pending',
  approved: 'success',
  rejected: 'danger',
}

export function EstimateStatusBadge({ status, className }: { status: EstimateStatus; className?: string }) {
  return (
    <SemanticBadge tone={ESTIMATE_SEMANTIC_TONE[status]} className={className}>
      {ESTIMATE_STATUS_LABELS[status]}
    </SemanticBadge>
  )
}
