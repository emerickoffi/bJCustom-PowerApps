'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Landmark, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { payInvoiceOnlineAction } from '@/app/actions/payments'
import { formatMoney } from '@/lib/financials'
import type { OnlineMethod } from '@/lib/online-payments'

/** Homeowner portal: pay the invoice balance on Stripe's secure page. */
export function PayOnline({ invoiceId, balanceCents, methods, companyName }: { invoiceId: string; balanceCents: number; methods: OnlineMethod[]; companyName: string }) {
  const [pending, start] = useTransition()
  const [choice, setChoice] = useState<OnlineMethod | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pay = (method: OnlineMethod) => {
    setChoice(method)
    setError(null)
    start(async () => {
      const r = await payInvoiceOnlineAction({ invoiceId, method })
      if (r.ok && r.url) window.location.assign(r.url)
      else {
        setError(r.ok ? 'Try again.' : r.error)
        setChoice(null)
      }
    })
  }

  return (
    <section aria-labelledby="pay-heading" className="surface flex flex-col gap-4 border-l-4 border-l-primary p-5 md:p-6 print:hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pay-heading" className="type-section-title text-foreground">
          Pay this invoice
        </h2>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{formatMoney(balanceCents)}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {methods.includes('ach') && (
          <Button size="lg" className="h-12 flex-1" disabled={pending} onClick={() => pay('ach')}>
            <Landmark className="size-4" aria-hidden="true" />
            {pending && choice === 'ach' ? 'Opening…' : 'Pay by bank transfer'}
          </Button>
        )}
        {methods.includes('card') && (
          <Button size="lg" variant={methods.includes('ach') ? 'outline' : 'default'} className="h-12 flex-1" disabled={pending} onClick={() => pay('card')}>
            <CreditCard className="size-4" aria-hidden="true" />
            {pending && choice === 'card' ? 'Opening…' : 'Pay by card'}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-champagne-soft px-3 py-2 text-sm text-foreground">
          {error}
        </p>
      )}
      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        You&apos;ll pay on Stripe&apos;s secure page; {companyName} never sees your card or bank details.
        {methods.includes('ach') && ' Bank transfers take 3–5 business days to clear.'}
      </p>
    </section>
  )
}
