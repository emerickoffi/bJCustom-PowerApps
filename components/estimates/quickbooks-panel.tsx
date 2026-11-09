import Link from 'next/link'
import type { QuickBooksStatus } from '@/lib/quickbooks'
import { quickBooksStatusLabel } from '@/lib/quickbooks'

export function QuickBooksPanel({
  estimateStatus,
  status,
  moduleEnabled,
  canConfigure,
}: {
  estimateStatus: string
  status: QuickBooksStatus
  moduleEnabled: boolean
  canConfigure: boolean
}) {
  const approved = estimateStatus === 'approved'
  const connected = status.connected && moduleEnabled
  const reason = !approved
    ? 'Available after approval.'
    : connected
      ? 'Ready to send to QuickBooks.'
      : `Connect QuickBooks first. ${quickBooksStatusLabel(status)}.`

  return (
    <section aria-labelledby="qbo-panel-heading" className="surface flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="qbo-panel-heading" className="text-sm font-semibold text-foreground">
          QuickBooks Online
        </h2>
        <span className="rounded-full bg-champagne-soft px-2 py-0.5 text-xs font-medium text-warning">
          {connected ? 'Connected' : 'Setup required'}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          disabled
          aria-describedby="qbo-send-reason"
          className="rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground disabled:cursor-not-allowed"
        >
          Send to QuickBooks
        </button>
        <span id="qbo-send-reason" className="text-xs text-muted-foreground">
          {reason}
        </span>
      </div>
      {!connected &&
        (canConfigure ? (
          <Link href="/settings/integrations" className="w-fit text-xs font-medium text-primary underline-offset-4 hover:underline">
            {'Settings → Integrations'}
          </Link>
        ) : (
          <p className="text-xs text-muted-foreground">An administrator can connect it in Settings.</p>
        ))}
    </section>
  )
}
