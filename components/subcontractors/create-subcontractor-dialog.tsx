'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { ChevronDown as ChevronDownIcon, HardHat as HardHatIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { TradeCombobox } from '@/components/subcontractors/trade-combobox'
import { createSubcontractorAction } from '@/app/actions/subcontractors'
import { OVERLAY_FIELD, initialActionState } from '@/lib/action-state'
import { cn } from '@/lib/utils'

export type CreatedSubcontractor = { id: string | null; label: string; trade: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Adds a subcontractor company to the existing directory from inside another workflow. It only creates the
 * directory record: no portal account, invitation, or qualification status is granted here.
 */
export function CreateSubcontractorDialog({
  open,
  onOpenChange,
  onCreated,
  finalFocus,
  submitLabel = 'Create & select',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (company: CreatedSubcontractor) => void
  finalFocus?: React.RefObject<HTMLElement | null>
  submitLabel?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={finalFocus}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg',
          'max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none',
        )}
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <HardHatIcon className="size-4 text-primary" aria-hidden="true" />
            Create new subcontractor
          </DialogTitle>
          <DialogDescription>
            Saved to your subcontractor directory and selected here. It does not invite anyone or grant portal access.
          </DialogDescription>
        </DialogHeader>
        {/* Remounting on open resets the form so a canceled draft never leaks into the next one. */}
        {open && <InlineSubcontractorForm onCreated={onCreated} onCancel={() => onOpenChange(false)} submitLabel={submitLabel} />}
      </DialogContent>
    </Dialog>
  )
}

function InlineSubcontractorForm({
  onCreated,
  onCancel,
  submitLabel,
}: {
  onCreated: (company: CreatedSubcontractor) => void
  onCancel: () => void
  submitLabel: string
}) {
  const [state, formAction] = useActionState(createSubcontractorAction, initialActionState)
  const submitted = useRef<{ label: string; trade: string }>({ label: '', trade: '' })
  const handled = useRef<string | null>(null)
  const v = state.values ?? {}
  const fe = state.fieldErrors ?? {}
  const [showMore, setShowMore] = useState(Boolean(v.email || v.phone || fe.email || fe.phone))
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'

  useEffect(() => {
    if (!state.savedId || handled.current === state.savedId) return
    handled.current = state.savedId
    onCreated({
      id: UUID_RE.test(state.savedId) ? state.savedId : null,
      label: submitted.current.label,
      trade: submitted.current.trade,
    })
  }, [state.savedId, onCreated])

  return (
    <form
      key={formKey}
      action={formAction}
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        // The dialog renders inside the parent form's React tree; keep its submit from reaching the parent.
        e.stopPropagation()
        const data = new FormData(e.currentTarget)
        submitted.current = {
          label: String(data.get('company_name') ?? '').trim(),
          trade: String(data.get('trade') ?? '').trim(),
        }
      }}
    >
      <input type="hidden" name={OVERLAY_FIELD} value="1" />
      <input type="hidden" name="status" value="active" />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-4">
          {!state.savedId && <FormMessage state={state} />}
          <TextField
            name="company_name"
            id="new_sub_company_name"
            label="Company name"
            required
            defaultValue={v.company_name ?? ''}
            error={fe.company_name}
            autoComplete="organization"
            autoFocus
            maxLength={160}
          />
          <TradeCombobox defaultValue={v.trade ?? ''} error={fe.trade} />
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
            className="flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ChevronDownIcon className={cn('size-4 transition-transform', showMore && 'rotate-180')} aria-hidden="true" />
            {showMore ? 'Hide contact details' : 'Add contact details (optional)'}
          </button>
          <div className={cn('grid gap-4 sm:grid-cols-2', !showMore && 'hidden')}>
            <TextField name="email" id="new_sub_email" label="Company email" type="email" inputMode="email" defaultValue={v.email ?? ''} error={fe.email} maxLength={254} />
            <TextField name="phone" id="new_sub_phone" label="Main phone" type="tel" inputMode="tel" defaultValue={v.phone ?? ''} error={fe.phone} maxLength={30} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Add contact persons, insurance, and qualification details later from the subcontractor profile.
          </p>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-5 py-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Creating subcontractor…">{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}
