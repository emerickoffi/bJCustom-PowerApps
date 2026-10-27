import { StatusPill } from '@/components/shared/status-badge'
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_TONES, isOverdue, type InvoiceStatus } from '@/lib/invoices'

export function InvoiceStatusBadge({
  status,
  dueDate,
  className,
}: {
  status: InvoiceStatus
  dueDate?: string
  className?: string
}) {
  if (dueDate && isOverdue({ status, due_date: dueDate })) {
    return (
      <StatusPill tone="danger" className={className}>
        Overdue
      </StatusPill>
    )
  }
  return (
    <StatusPill tone={INVOICE_STATUS_TONES[status]} className={className}>
      {INVOICE_STATUS_LABELS[status]}
    </StatusPill>
  )
}
