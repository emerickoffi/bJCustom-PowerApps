'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { FileText, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react'
import { deleteOptionAction, saveOptionAction } from '@/app/actions/selections'
import { initialActionState } from '@/lib/action-state'
import { formatMoney } from '@/lib/financials'
import type { SelectionOption } from '@/lib/selections'
import { TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const centsToInput = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2))

function OptionForm({
  projectId,
  selectionId,
  option,
  onDone,
}: {
  projectId: string
  selectionId: string
  option?: SelectionOption
  onDone: () => void
}) {
  const [state, action] = useActionState(saveOptionAction, initialActionState)
  const v = state.values ?? {}
  const err = state.fieldErrors ?? {}
  const pick = (key: string, fallback: string) => (key in v ? v[key] : fallback)
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (state.success) done.current()
  }, [state])

  return (
    <form action={action} className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-sage/30 p-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="selection_id" value={selectionId} />
      {option && <input type="hidden" name="id" value={option.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="name" label="Option name" required maxLength={160} defaultValue={pick('name', option?.name ?? '')} error={err.name} />
        <TextField
          name="price"
          label="Homeowner price"
          required
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={pick('price', centsToInput(option?.price_cents))}
          error={err.price}
        />
        <TextField name="supplier" label="Supplier" maxLength={160} defaultValue={pick('supplier', option?.supplier ?? '')} error={err.supplier} />
        <TextField name="model_number" label="Model number" maxLength={120} defaultValue={pick('model_number', option?.model_number ?? '')} error={err.model_number} />
        <TextField
          name="availability"
          label="Availability / lead time"
          maxLength={160}
          placeholder="In stock, 2 weeks"
          defaultValue={pick('availability', option?.availability ?? '')}
          error={err.availability}
        />
        <TextField
          name="internal_cost"
          label="Builder cost"
          inputMode="decimal"
          placeholder="0.00"
          hint="Internal only. Never shown to the homeowner."
          defaultValue={pick('internal_cost', centsToInput(option?.internal_cost_cents))}
          error={err.internal_cost}
        />
      </div>
      <TextAreaField
        name="description"
        label="Description"
        maxLength={2000}
        inputClassName="min-h-16"
        defaultValue={pick('description', option?.description ?? '')}
        error={err.description}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <FileInput name="photo" label="Photo" accept="image/jpeg,image/png,image/webp" error={err.photo} existing={option?.photo_path ? 'Current photo kept unless replaced' : null} removeName="remove_photo" />
        <FileInput
          name="spec"
          label="Spec sheet"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          error={err.spec}
          existing={option?.spec_path ? (option.spec_name ?? 'Current spec sheet') : null}
          removeName="remove_spec"
        />
      </div>
      <FormMessage state={state.success ? initialActionState : state} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton size="default" pendingLabel="Saving…">
          {option ? 'Save option' : 'Add option'}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function FileInput({
  name,
  label,
  accept,
  error,
  existing,
  removeName,
}: {
  name: string
  label: string
  accept: string
  error?: string
  existing: string | null
  removeName: string
}) {
  const id = `option-${name}`
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground"
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {existing ?? 'Up to 15 MB.'}
        </p>
      )}
      {existing && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name={removeName} className="size-3.5 accent-primary" />
          Remove current file
        </label>
      )}
    </div>
  )
}

function DeleteOption({ projectId, selectionId, optionId, name }: { projectId: string; selectionId: string; optionId: string; name: string }) {
  const [state, action] = useActionState(deleteOptionAction, initialActionState)
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(`Remove "${name}"?`)) e.preventDefault()
      }}
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="selection_id" value={selectionId} />
      <input type="hidden" name="id" value={optionId} />
      <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Remove ${name}`}>
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
      {state.error && (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      )}
    </form>
  )
}

export function OptionEditor({
  projectId,
  selectionId,
  options,
  editable,
  allowanceCents,
  selectedOptionId,
}: {
  projectId: string
  selectionId: string
  options: SelectionOption[]
  editable: boolean
  allowanceCents: number | null
  selectedOptionId: string | null
}) {
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 && editing !== 'new' && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {editable ? 'Add the options the homeowner can choose from.' : 'No options were added.'}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {options.map((o) =>
          editing === o.id ? (
            <li key={o.id}>
              <OptionForm projectId={projectId} selectionId={selectionId} option={o} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li
              key={o.id}
              className={cn('flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row', o.id === selectedOptionId && 'border-primary ring-1 ring-primary/30')}
            >
              <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                {o.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                  <img src={o.photo_url} alt={o.name} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{o.name}</span>
                  {o.id === selectedOptionId && <SemanticBadge tone="success">Homeowner&apos;s choice</SemanticBadge>}
                </div>
                <p className="text-sm text-muted-foreground">{[o.supplier, o.model_number, o.availability].filter(Boolean).join(' · ') || 'No supplier details'}</p>
                {o.description && <p className="text-pretty text-sm leading-relaxed text-foreground">{o.description}</p>}
                {o.spec_url && (
                  <a href={o.spec_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
                    <FileText className="size-4" aria-hidden="true" />
                    {o.spec_name ?? 'Spec sheet'}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 flex-row items-start justify-between gap-3 sm:flex-col sm:items-end">
                <div className="flex flex-col sm:items-end">
                  <span className="font-semibold tabular-nums text-foreground">{formatMoney(o.price_cents)}</span>
                  {allowanceCents !== null && (
                    <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(o.price_cents - allowanceCents, { signed: true })} vs allowance</span>
                  )}
                  {o.internal_cost_cents !== null && <span className="text-xs tabular-nums text-muted-foreground">Cost {formatMoney(o.internal_cost_cents)}</span>}
                </div>
                {editable && (
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Edit ${o.name}`} onClick={() => setEditing(o.id)}>
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <DeleteOption projectId={projectId} selectionId={selectionId} optionId={o.id} name={o.name} />
                  </div>
                )}
              </div>
            </li>
          ),
        )}
      </ul>
      {editable &&
        (editing === 'new' ? (
          <OptionForm projectId={projectId} selectionId={selectionId} onDone={() => setEditing(null)} />
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden="true" />
            Add option
          </Button>
        ))}
    </div>
  )
}
