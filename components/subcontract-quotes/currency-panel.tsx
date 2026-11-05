'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setProjectCurrencyAction } from '@/app/actions/subcontract-quotes'
import { SUPPORTED_CURRENCIES } from '@/lib/subcontract-quotes'

export function CurrencyPanel({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [currency, setCurrency] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start gap-2">
        <Coins className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-foreground">Confirm this project&apos;s currency</p>
          <p className="text-sm text-muted-foreground">
            Quotes are recorded in the project currency. It is not set yet, so requests cannot be sent. Once confirmed it cannot be changed here.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-foreground">Currency</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Choose…</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={!currency || pending}
          onClick={() =>
            start(async () => {
              const r = await setProjectCurrencyAction(projectId, currency)
              if (!r.ok) setError(r.error)
              else router.refresh()
            })
          }
        >
          {pending ? 'Saving…' : `Use ${currency || 'currency'}`}
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
