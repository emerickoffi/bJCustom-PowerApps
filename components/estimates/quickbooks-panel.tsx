import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
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
  const ready = approved && moduleEnabled && status.connected

  return (
    <section aria-labelledby="qbo-panel-heading" className="surface flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="qbo-panel-heading" className="font-serif text-lg font-semibold text-foreground">
          QuickBooks Online
        </h2>
        <span className="rounded-full bg-champagne-soft px-2 py-0.5 text-xs font-medium text-warning">
          {status.connected && moduleEnabled ? 'Connected' : 'Setup required'}
        </span>
      </div>

      {!approved ? (
        <p className="text-sm font-medium text-foreground">Approval required before export.</p>
      ) : ready ? (
        <p className="text-sm text-muted-foreground">This approved estimate is ready to send to QuickBooks.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {'Send to QuickBooks becomes available once QuickBooks is connected and turned on. '}
          {quickBooksStatusLabel(status)}.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled
          aria-describedby="qbo-send-reason"
          className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground disabled:cursor-not-allowed"
        >
          Send to QuickBooks
        </button>
        <span id="qbo-send-reason" className="text-xs text-muted-foreground">
          {!approved ? 'Unavailable until approved' : 'Unavailable until QuickBooks is connected'}
        </span>
      </div>

      {canConfigure ? (
        <Link
          href="/settings/integrations"
          className="flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {'Open Settings → Integrations'}
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">An administrator can set this up in Settings → Integrations.</p>
      )}
    </section>
  )
}
