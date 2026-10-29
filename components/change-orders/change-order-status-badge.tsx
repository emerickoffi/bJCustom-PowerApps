import { StatusPill } from '@/components/shared/status-badge'
import { CHANGE_ORDER_STATUS_LABELS, CHANGE_ORDER_STATUS_TONES, type ChangeOrderStatus } from '@/lib/change-orders'

export function ChangeOrderStatusBadge({ status, className }: { status: ChangeOrderStatus; className?: string }) {
  return (
    <StatusPill tone={CHANGE_ORDER_STATUS_TONES[status]} className={className}>
      {CHANGE_ORDER_STATUS_LABELS[status]}
    </StatusPill>
  )
}
