'use client'

import { useActionState, useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Eye, FileDiff, Lock, Plus } from 'lucide-react'
import { saveChangeOrderAction } from '@/app/actions/change-orders'
import { initialActionState } from '@/lib/action-state'
import { formatMoney, parseSignedDollarsToCents } from '@/lib/financials'
import { formatScheduleDays } from '@/lib/change-orders'
import { TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { useFormDirty } from '@/components/shared/smart-form'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function NewChangeOrderDrawer({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const dirtyRef = useRef(false)
  const keepRef = useRef<HTMLButtonElement>(null)

  const close = useCallback(() => {
    dirtyRef.current = false
    setConfirming(false)
    setOpen(false)
  }, [])

  // Cancel, the X button, Escape and outside clicks all route through here.
  const requestClose = useCallback(() => {
    if (!dirtyRef.current) return close()
    setConfirming(true)
    requestAnimationFrame(() => keepRef.current?.focus())
  }, [close])

  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty
    if (!dirty) setConfirming(false)
  }, [])

  const keepEditing = () => {
    setConfirming(false)
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#new-co-form input[name="title"]')?.focus())
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : requestClose())}>
      {/* The trigger replaces the button's data-slot, so the page header's shared action height is set here. */}
      <SheetTrigger render={<Button className="md:h-10" />}>
        <Plus className="size-4" aria-hidden="true" />
        New change order
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl">
        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby="co-discard-title"
            aria-describedby="co-discard-desc"
            className="flex shrink-0 flex-col gap-3 border-b border-amber-300/70 bg-amber-50 px-6 py-3.5 pr-14 text-amber-950 sm:flex-row sm:items-center dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <div className="flex flex-1 items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col">
                <p id="co-discard-title" className="font-medium">
                  Discard unsaved changes?
                </p>
                <p id="co-discard-desc">Your changes have not been saved.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button ref={keepRef} type="button" size="sm" variant="outline" className="bg-background" onClick={keepEditing}>
                Keep editing
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={close}>
                Discard changes
              </Button>
            </div>
          </div>
        )}
        {/* Remount per open so a cancelled draft never leaks into the next one. */}
        {open && <DraftForm projectId={projectId} projectName={projectName} onDirtyChange={onDirtyChange} onCancel={requestClose} />}
      </SheetContent>
    </Sheet>
  )
}

function DraftForm({
  projectId,
  projectName,
  onDirtyChange,
  onCancel,
}: {
  projectId: string
  projectName: string
  onDirtyChange: (dirty: boolean) => void
  onCancel: () => void
}) {
  const [state, action] = useActionState(saveChangeOrderAction, initialActionState)
  const v = state.values
  const fe = state.fieldErrors ?? {}
  const [price, setPrice] = useState(v?.price_adjustment ?? '')
  const [schedule, setSchedule] = useState(v?.schedule_impact_days ?? '')
  const priceCents = parseSignedDollarsToCents(price || '0')
  const days = schedule.trim() === '' ? null : Number(schedule)
  // Re-check after a failed save, when React resets the form and fields are refilled from state.values.
  const { formRef, check } = useFormDirty(JSON.stringify(state), onDirtyChange)

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  return (
    <form id="new-co-form" ref={formRef} action={action} onInput={check} onChange={check} className="flex h-full min-h-0 flex-col">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="lines_json" value="[]" />

      <SheetHeader className="gap-1 border-b border-border/70 px-6 pb-5 pt-6">
        <div className="flex items-center gap-3 pr-8">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary ring-1 ring-inset ring-primary/10" aria-hidden="true">
            <FileDiff className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <SheetTitle className="font-serif text-xl font-semibold tracking-tight text-foreground">New change order</SheetTitle>
            <SheetDescription className="truncate">{projectName}</SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <fieldset aria-describedby="new-co-homeowner-note" className="flex flex-col gap-5">
          <legend className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Eye className="size-3.5" aria-hidden="true" />
            Homeowner sees
          </legend>
          <p id="new-co-homeowner-note" className="text-xs leading-relaxed text-muted-foreground">
            Title, description, price change and schedule impact.
          </p>
          <TextField name="title" label="Title" required autoFocus defaultValue={v?.title} error={fe.title} maxLength={160} placeholder="e.g. Upgrade kitchen island to quartz" />
          <TextAreaField name="description" label="Description" defaultValue={v?.description} error={fe.description} maxLength={4000} rows={3} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="price_adjustment"
              label="Price adjustment ($)"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={fe.price_adjustment}
              hint="Positive amount adds to the homeowner price. Negative amount gives a credit."
            />
            <TextField
              name="schedule_impact_days"
              label="Schedule impact (days)"
              inputMode="numeric"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              error={fe.schedule_impact_days}
              hint="Leave blank if unknown. Enter 0 for no impact."
            />
          </div>
        </fieldset>

        <div className="border-t border-border/70 pt-6">
          <fieldset aria-describedby="new-co-internal-note" className="flex flex-col gap-5">
            <legend className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" />
              Internal only
            </legend>
            <p id="new-co-internal-note" className="text-xs leading-relaxed text-muted-foreground">
              Builder cost lines, margin and the reason for the change.
            </p>
            <TextField name="requested_by" label="Requested by" defaultValue={v?.requested_by} error={fe.requested_by} maxLength={160} hint="Homeowner, architect, field condition, etc." />
            <TextAreaField name="reason" label="Reason for change" defaultValue={v?.reason} error={fe.reason} maxLength={2000} rows={3} />
          </fieldset>
        </div>

        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          Builder cost lines are added on the next page, after the draft is created.
        </p>
      </div>

      <SheetFooter className="mt-0 gap-4 border-t border-border/70 bg-muted/30 px-6 py-4">
        <dl className="grid grid-cols-2 gap-3 text-sm" aria-live="polite">
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Price adjustment</dt>
            <dd className="text-lg font-semibold tabular-nums text-primary">{priceCents === null ? '—' : formatMoney(priceCents, { signed: true })}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">Schedule impact</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">
              {days === null || !Number.isInteger(days) ? 'Not set' : formatScheduleDays(days, 'long')}
            </dd>
          </div>
        </dl>
        <FormMessage state={state} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <SubmitButton pendingLabel="Creating draft...">Create draft</SubmitButton>
        </div>
      </SheetFooter>
    </form>
  )
}
