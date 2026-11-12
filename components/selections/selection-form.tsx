'use client'

import { useActionState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSelectionAction } from '@/app/actions/selections'
import { initialActionState } from '@/lib/action-state'
import { TextAreaField, TextField } from '@/components/shared/form-field'
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
  initial = {},
  onDone,
}: {
  projectId: string
  categories: string[]
  initial?: SelectionFormValues
  onDone?: () => void
}) {
  const router = useRouter()
  const [state, action] = useActionState(saveSelectionAction, initialActionState)
  const v = state.values ?? {}
  const err = state.fieldErrors ?? {}
  const pick = (key: string, fallback: string) => (key in v ? v[key] : fallback)

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
        <TextField
          name="category"
          label="Category"
          required
          maxLength={60}
          list="selection-categories"
          placeholder="Plumbing fixtures"
          defaultValue={pick('category', initial.category ?? '')}
          error={err.category}
          hint="Pick a saved category or type a new one."
        />
        <datalist id="selection-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <TextField
          name="location"
          label="Room or location"
          maxLength={160}
          placeholder="Kitchen island"
          defaultValue={pick('location', initial.location ?? '')}
          error={err.location}
        />
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
