'use client'

import { useState, useTransition } from 'react'
import { ListPlus, Loader2 } from 'lucide-react'
import { getBillableSourcesAction } from '@/app/actions/invoices'
import type { BillableSources } from '@/lib/invoice-sources-data'
import { changeOrderLine, groupTime, minutesToHours, timeLine, type TimeGroup } from '@/lib/invoice-sources'
import { dollarsToCents, type InvoiceLineInput } from '@/lib/invoices'
import { formatCentsExact } from '@/lib/estimates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Add from: pick approved change orders and approved crew time on the project; each becomes an invoice line that
 * remembers what it bills, so the same item can't be billed twice. Items already on another invoice are shown, not
 * selectable.
 */
export function AddFromDialog({
  projectId,
  invoiceId,
  linkedToEstimate,
  usedSourceIds,
  onAdd,
}: {
  projectId: string
  invoiceId: string | null
  linkedToEstimate: boolean
  /** Sources already on lines of this form (not saved yet). */
  usedSourceIds: Set<string>
  onAdd: (lines: InvoiceLineInput[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, start] = useTransition()
  const [data, setData] = useState<BillableSources | null>(null)
  const [pickedCos, setPickedCos] = useState<Set<string>>(new Set())
  const [pickedPeople, setPickedPeople] = useState<Set<string>>(new Set())
  const [billRate, setBillRate] = useState('')
  const [rateError, setRateError] = useState<string | null>(null)

  const load = () => {
    setPickedCos(new Set())
    setPickedPeople(new Set())
    setBillRate('')
    setRateError(null)
    start(async () => setData(await getBillableSourcesAction(projectId, invoiceId)))
  }

  const names = new Map(data?.names ?? [])
  const time = (data?.time ?? []).filter((t) => !usedSourceIds.has(`time_entry:${t.id}`))
  const groups: TimeGroup[] = data ? groupTime(time, names) : []
  const billedTime = (data?.time ?? []).filter((t) => t.billed_on).length
  const cos = data?.changeOrders ?? []

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }

  const add = () => {
    let rate: number | null = null
    if (billRate.trim()) {
      rate = dollarsToCents(billRate.trim())
      if (rate === null || rate <= 0) return setRateError('Enter an hourly rate like 85.00, or leave it blank.')
    }
    const lines = [
      ...cos.filter((c) => pickedCos.has(c.id)).map(changeOrderLine),
      ...groups.filter((g) => pickedPeople.has(g.userId)).map((g) => timeLine(g, rate)),
    ]
    onAdd(lines)
    setOpen(false)
  }

  const picked = pickedCos.size + pickedPeople.size

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={!projectId}
        onClick={() => {
          setOpen(true)
          load()
        }}
        title={projectId ? undefined : 'Choose a project first'}
      >
        <ListPlus data-icon="inline-start" />
        Add from…
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add from this project</DialogTitle>
            <DialogDescription>
              Pick what to bill. Each item can only be billed once; voiding an invoice makes its items available again.
            </DialogDescription>
          </DialogHeader>

          {loading || !data ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading approved change orders and crew time…
            </p>
          ) : !data.available ? (
            <p className="rounded-lg bg-champagne-soft px-3 py-2 text-sm text-foreground">
              Add from needs a database update before it can be used.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-foreground">Approved change orders</legend>
                {cos.length === 0 && <p className="text-sm text-muted-foreground">No approved change orders that add to the price.</p>}
                {cos.map((c) => {
                  const onForm = usedSourceIds.has(`change_order:${c.id}`)
                  const disabled = Boolean(c.billed_on) || onForm
                  return (
                    <label
                      key={c.id}
                      className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${disabled ? 'opacity-60' : 'cursor-pointer hover:bg-muted/60'}`}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        disabled={disabled}
                        checked={pickedCos.has(c.id)}
                        onChange={() => toggle(pickedCos, c.id, setPickedCos)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="font-medium text-foreground">
                          {c.co_number ?? 'Change order'}: {c.title}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {c.billed_on ? `Already billed on ${c.billed_on}` : onForm ? 'Already on this invoice' : c.selection_name ? `Selection: ${c.selection_name}` : 'Not billed yet'}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">{formatCentsExact(c.price_cents)}</span>
                    </label>
                  )
                })}
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-foreground">Approved crew time</legend>
                {linkedToEstimate && (
                  <p className="text-xs text-muted-foreground">
                    This invoice bills against a fixed-price estimate, so crew time counts toward its limit. Billing time usually
                    fits time-and-materials work on an invoice that isn&apos;t linked to an estimate.
                  </p>
                )}
                {groups.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No unbilled approved time.{billedTime ? ` ${billedTime} approved ${billedTime === 1 ? 'entry is' : 'entries are'} already billed.` : ''}
                  </p>
                )}
                {groups.map((g) => (
                  <label key={g.userId} className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm hover:bg-muted/60">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={pickedPeople.has(g.userId)}
                      onChange={() => toggle(pickedPeople, g.userId, setPickedPeople)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-foreground">{g.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {g.entryIds.length} {g.entryIds.length === 1 ? 'entry' : 'entries'} · cost rate {formatCentsExact(g.costRateCents)}/h
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground">{minutesToHours(g.minutes)} h</span>
                  </label>
                ))}
                {groups.length > 0 && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <label htmlFor="add-from-rate" className="text-sm font-medium text-foreground">
                      Hourly bill rate ($)
                    </label>
                    <Input
                      id="add-from-rate"
                      inputMode="decimal"
                      value={billRate}
                      onChange={(e) => {
                        setBillRate(e.target.value)
                        setRateError(null)
                      }}
                      placeholder="Leave blank to use each person's cost rate"
                      aria-invalid={rateError ? true : undefined}
                      aria-describedby="add-from-rate-hint"
                      className="max-w-xs"
                    />
                    <p id="add-from-rate-hint" className={rateError ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                      {rateError ?? 'What you charge the homeowner per hour. You can still change each line after adding it.'}
                    </p>
                  </div>
                )}
              </fieldset>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={add} disabled={picked === 0}>
              {picked ? `Add ${picked} ${picked === 1 ? 'line' : 'lines'}` : 'Add lines'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
