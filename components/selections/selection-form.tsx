'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSelectionAction } from '@/app/actions/selections'
import { initialActionState } from '@/lib/action-state'
import { FieldShell, TextAreaField, TextField } from '@/components/shared/form-field'
import { CategoryPicker, LocationPicker } from '@/components/selections/option-pickers'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'

export type SelectionFormValues = {
  id?: string
  version?: number
  name?: string
  category?: string
  location?: string | null
  description?: string | null
  notes?: string | null
  internal_notes?: string | null
  cost_code?: string | null
  allowance_cents?: number | null
  due_date?: string | null
}

const centsToInput = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2))

export function SelectionForm({
  projectId,
  categories,
  locations,
  canCreateCategory,
  initial = {},
  onDone,
}: {
  projectId: string
  categories: string[]
  locations: string[]
  canCreateCategory: boolean
  initial?: SelectionFormValues
  onDone?: () => void
}) {
  const router = useRouter()
  const [state, action] = useActionState(saveSelectionAction, initialActionState)
  const v = state.values ?? {}
  const err = state.fieldErrors ?? {}
  const pick = (key: string, fallback: string) => (key in v ? v[key] : fallback)
  const [category, setCategory] = useState(initial.category ?? '')
  const [location, setLocation] = useState(initial.location ?? '')

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="project_id" value={projectId} />
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {initial.version && <input type="hidden" name="expected_version" value={initial.version} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="name"
          label="Selection"
          required
          maxLength={160}
          placeholder="Kitchen faucet"
          defaultValue={pick('name', initial.name ?? '')}
          error={err.name}
        />
        <FieldShell name="category" label="Category" required error={err.category}>
          <CategoryPicker
            id="category"
            name="category"
            value={category}
            onValueChange={setCategory}
            options={categories}
            canCreate={canCreateCategory}
            invalid={!!err.category}
            describedBy={err.category ? 'category-error' : undefined}
          />
        </FieldShell>
        <FieldShell name="location" label="Room or location" error={err.location} hint="Pick a room or type your own.">
          <LocationPicker
            id="location"
            name="location"
            value={location}
            onValueChange={setLocation}
            options={locations}
            placeholder="Kitchen island"
            invalid={!!err.location}
            describedBy={err.location ? 'location-error' : 'location-hint'}
          />
        </FieldShell>
        <TextField
          name="due_date"
          label="Homeowner decision due"
          type="date"
          defaultValue={pick('due_date', initial.due_date ?? '')}
          error={err.due_date}
        />
        <TextField
          name="allowance"
          label="Allowance"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={pick('allowance', centsToInput(initial.allowance_cents))}
          error={err.allowance}
          hint="Price included in the contract. Leave blank if there is no allowance."
        />
        <TextField
          name="cost_code"
          label="Cost code"
          maxLength={40}
          placeholder="15-400"
          defaultValue={pick('cost_code', initial.cost_code ?? '')}
          error={err.cost_code}
        />
      </div>

      <TextAreaField
        name="description"
        label="Description for the homeowner"
        maxLength={4000}
        inputClassName="min-h-20"
        defaultValue={pick('description', initial.description ?? '')}
        error={err.description}
      />
      <TextAreaField
        name="notes"
        label="Notes shown to the homeowner"
        maxLength={4000}
        inputClassName="min-h-20"
        defaultValue={pick('notes', initial.notes ?? '')}
        error={err.notes}
      />
      <TextAreaField
        name="internal_notes"
        label="Internal notes"
        hint="Only your team sees these."
        maxLength={4000}
        inputClassName="min-h-20"
        defaultValue={pick('internal_notes', initial.internal_notes ?? '')}
        error={err.internal_notes}
      />

      <FormMessage state={state} />
      {state.conflict && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => router.refresh()}>
          Refresh
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pendingLabel="Saving…">{initial.id ? 'Save details' : 'Create selection'}</SubmitButton>
        {onDone && (
          <Button type="button" variant="ghost" size="lg" onClick={onDone}>
            Close
          </Button>
        )}
      </div>
    </form>
  )
}
