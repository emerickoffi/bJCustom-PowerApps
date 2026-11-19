'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { disconnectQuickBooksAction, sendInvoiceToQuickBooksAction, syncAllToQuickBooksAction } from '@/app/actions/quickbooks'

export function QuickBooksSyncAllButton() {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncAllToQuickBooksAction()
          if (r.ok) toast.success(r.message)
          else toast.error(r.error)
        })
      }
    >
      {pending ? 'Syncing…' : 'Sync invoices now'}
    </Button>
  )
}

export function QuickBooksDisconnectButton() {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  if (!confirming) {
    return (
      <Button variant="ghost" onClick={() => setConfirming(true)}>
        Disconnect
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Disconnect QuickBooks? Records already sent stay in QuickBooks.</span>
      <Button
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await disconnectQuickBooksAction()
            if (r.ok) toast.success('QuickBooks disconnected.')
            else toast.error(r.error ?? 'Try again.')
            setConfirming(false)
          })
        }
      >
        {pending ? 'Disconnecting…' : 'Yes, disconnect'}
      </Button>
      <Button variant="ghost" disabled={pending} onClick={() => setConfirming(false)}>
        Cancel
      </Button>
    </div>
  )
}

export function SendInvoiceToQuickBooksButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const [pending, start] = useTransition()
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await sendInvoiceToQuickBooksAction(invoiceId)
          if (r.ok) toast.success(r.message)
          else toast.error(r.error)
        })
      }
    >
      {pending ? 'Sending…' : label}
    </Button>
  )
}
