'use client'

import { useState, useTransition } from 'react'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { openPaymentsDashboardAction, setAcceptedMethodsAction } from '@/app/actions/payments'

export function StripeDashboardButton() {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await openPaymentsDashboardAction()
          if (r.ok && r.url) window.open(r.url, '_blank', 'noopener')
          else if (!r.ok) toast.error(r.error)
        })
      }
    >
      <ExternalLink className="size-4" aria-hidden="true" />
      {pending ? 'Opening…' : 'Payouts & refunds in Stripe'}
    </Button>
  )
}

export function AcceptedMethods({ card, ach }: { card: boolean; ach: boolean }) {
  const [state, setState] = useState({ card, ach })
  const [pending, start] = useTransition()
  const save = (next: { card: boolean; ach: boolean }) => {
    if (!next.card && !next.ach) {
      toast.error('Keep at least one way to pay turned on.')
      return
    }
    const prev = state
    setState(next)
    start(async () => {
      const r = await setAcceptedMethodsAction(next)
      if (r.ok) toast.success('Saved.')
      else {
        setState(prev)
        toast.error(r.error)
      }
    })
  }
  return (
    <fieldset className="flex flex-col gap-2" disabled={pending}>
      <legend className="mb-1 text-sm font-medium text-foreground">Homeowners can pay by</legend>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={state.card} onChange={(e) => save({ ...state, card: e.target.checked })} />
        <span>
          Card <span className="text-muted-foreground">· about 2.9% + 30¢ per payment, paid by you</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={state.ach} onChange={(e) => save({ ...state, ach: e.target.checked })} />
        <span>
          Bank transfer (ACH) <span className="text-muted-foreground">· 0.8%, at most $5 per payment; clears in 3–5 business days</span>
        </span>
      </label>
    </fieldset>
  )
}
