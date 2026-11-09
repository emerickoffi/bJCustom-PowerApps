'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Coins } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { setProjectCurrencyAction } from '@/app/actions/subcontract-quotes'
import { SUPPORTED_CURRENCIES } from '@/lib/subcontract-quotes'

/** Compact notice shown while a project's currency is unset. Saving uses the same authoritative action as the request drawer. */
export function CurrencyNotice({ projectId, canConfirm }: { projectId: string; canConfirm: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [currency, setCurrency] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const save = () =>
    start(async () => {
      setError(null)
      const r = await setProjectCurrencyAction(projectId, currency)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setOpen(false)
      router.refresh()
    })

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex items-start gap-2 text-foreground">
        <Coins className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        {canConfirm
          ? 'Confirm project currency before sending quote requests.'
          : 'Project currency isn’t confirmed, so quote requests can’t be sent yet. Ask a company administrator to confirm it.'}
      </p>
      {canConfirm ? (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (pending) return
            setOpen(next)
            if (next) setError(null)
          }}
        >
          <DialogTrigger render={<Button type="button" size="sm" variant="outline" className="shrink-0 max-sm:min-h-11" />}>
            Confirm currency
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm project currency</DialogTitle>
              <DialogDescription>
                Quotes for this project are recorded in this currency. Once confirmed, it can&apos;t be changed here and existing amounts
                aren&apos;t converted.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <label htmlFor="confirm-project-currency" className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">Currency</span>
                <select
                  id="confirm-project-currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? 'confirm-project-currency-error' : undefined}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Choose…</option>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>I confirm {currency || 'this currency'} is correct for this project.</span>
              </label>
              {error ? (
                <p id="confirm-project-currency-error" role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="button" onClick={save} disabled={!currency || !confirmed || pending}>
                {pending ? 'Saving…' : `Confirm ${currency || 'currency'}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
