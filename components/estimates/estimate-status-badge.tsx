import { StatusPill } from '@/components/shared/status-badge'
import { ESTIMATE_STATUS_LABELS, ESTIMATE_STATUS_TONES, type EstimateStatus } from '@/lib/estimates'

export function EstimateStatusBadge({ status, className }: { status: EstimateStatus; className?: string }) {
  return (
    <StatusPill tone={ESTIMATE_STATUS_TONES[status]} className={className}>
      {ESTIMATE_STATUS_LABELS[status]}
    </StatusPill>
  )
}
