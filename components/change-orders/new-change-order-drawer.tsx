'use client'

import { useActionState, useState } from 'react'
import { Eye, FileDiff, Lock, Plus } from 'lucide-react'
import { saveChangeOrderAction } from '@/app/actions/change-orders'
import { initialActionState } from '@/lib/action-state'
import { formatMoney, parseSignedDollarsToCents } from '@/lib/financials'
import { formatScheduleDays } from '@/lib/change-orders'
import { TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'

export function NewChangeOrderDrawer({ projectId, projectName, size = 'default' }: { projectId: string; projectName: string; size?: 'default' | 'lg' }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size={size} />}>
        <Plus className="size-4" aria-hidden="true" />
        New change order
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl">
        {/* Remount per open so a cancelled draft never leaks into the next one. */}
        {open && <DraftForm projectId={projectId} projectName={projectName} />}
      </SheetContent>
    </Sheet>
  )
}

function DraftForm({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [state, action] = useActionState(saveChangeOrderAction, initialActionState)
  const v = state.values
  const fe = state.fieldErrors ?? {}
  const [price, setPrice] = useState(v?.price_adjustment ?? '')
  const [schedule, setSchedule] = useState(v?.schedule_impact_days ?? '')
  const priceCents = parseSignedDollarsToCents(price || '0')
  const days = schedule.trim() === '' ? null : Number(schedule)

  return (
    <form action={action} className="flex h-full min-h-0 flex-col">
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
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Eye className="size-3.5" aria-hidden="true" />
            Homeowner-visible
          </legend>
          <TextField name="title" label="Title" required autoFocus defaultValue={v?.title} error={fe.title} maxLength={160} placeholder="e.g. Upgrade kitchen island to quartz" />
          <TextAreaField name="description" label="Description" defaultValue={v?.description} error={fe.description} maxLength={4000} rows={3} />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              name="price_adjustment"
              label="Homeowner price change ($)"
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              error={fe.price_adjustment}
              hint="Use a minus sign for credits."
            />
            <TextField
              name="schedule_impact_days"
              label="Schedule impact (days)"
              inputMode="numeric"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              error={fe.schedule_impact_days}
              hint="Leave blank if unknown."
            />
          </div>
        </fieldset>

        <div className="border-t border-border/70 pt-6">
          <fieldset className="flex flex-col gap-5">
            <legend className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" />
              Internal only
            </legend>
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
            <dt className="text-xs text-muted-foreground">Homeowner price change</dt>
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
          <SheetClose render={<Button type="button" variant="outline" size="lg" />}>Cancel</SheetClose>
          <SubmitButton pendingLabel="Creating draft...">Create draft</SubmitButton>
        </div>
      </SheetFooter>
    </form>
  )
}
