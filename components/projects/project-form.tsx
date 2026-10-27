'use client'

import { House as HouseIcon, MapPin as MapPinIcon, CalendarRange as CalendarRangeIcon } from 'lucide-react'
import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { PROJECT_TYPE_LABELS } from '@/lib/domain'
import { FormActions, FormSection, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export type ProjectFormValues = {
  name?: string
  primary_client_id?: string
  project_type?: string
  description?: string | null
  address_line1?: string
  address_line2?: string | null
  city?: string
  state?: string
  postal_code?: string
  lot?: string | null
  block?: string | null
  phase?: string | null
  community?: string | null
  legal_description?: string | null
  estimated_budget_cents?: number | null
  proposed_start_date?: string | null
  target_completion_date?: string | null
  project_manager_id?: string | null
  internal_notes?: string | null
}

type Option = { value: string; label: string }

export function ProjectForm({
  action,
  defaults = {},
  clientOptions,
  managerOptions,
  submitLabel,
  cancelHref,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults?: ProjectFormValues
  clientOptions: Option[]
  managerOptions: Option[]
  submitLabel: string
  cancelHref: string
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const d = (v: string | null | undefined) => v ?? ''

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormSection icon={HouseIcon} title="Project" description="Name the project and choose the homeowner it is being built for.">
        <TextField name="name" label="Project name" required defaultValue={d(defaults.name)} error={fe.name} className="sm:col-span-2" />
        <SelectField
          name="primary_client_id"
          label="Primary homeowner"
          required
          placeholder="Select a client"
          options={clientOptions}
          defaultValue={defaults.primary_client_id}
          error={fe.primary_client_id}
          hint={clientOptions.length ? undefined : 'Create a client first.'}
        />
        <SelectField
          name="project_type"
          label="Project type"
          required
          options={Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          defaultValue={defaults.project_type ?? 'new_custom_home'}
          error={fe.project_type}
        />
        <TextAreaField
          name="description"
          label="Description"
          defaultValue={d(defaults.description)}
          error={fe.description}
          className="sm:col-span-2"
        />
      </FormSection>

      <FormSection icon={MapPinIcon} title="Site" description="Where the home is being built, including platted lot details.">
        <TextField name="address_line1" label="Street address" required defaultValue={d(defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField name="address_line2" label="Address line 2" defaultValue={d(defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <TextField name="city" label="City" required defaultValue={d(defaults.city)} error={fe.city} />
        <div className="grid grid-cols-2 gap-5">
          <TextField name="state" label="State" required defaultValue={d(defaults.state)} error={fe.state} />
          <TextField name="postal_code" label="ZIP" required defaultValue={d(defaults.postal_code)} error={fe.postal_code} />
        </div>
        <TextField name="community" label="Community / subdivision" defaultValue={d(defaults.community)} error={fe.community} />
        <div className="grid grid-cols-3 gap-5">
          <TextField name="lot" label="Lot" defaultValue={d(defaults.lot)} error={fe.lot} />
          <TextField name="block" label="Block" defaultValue={d(defaults.block)} error={fe.block} />
          <TextField name="phase" label="Phase" defaultValue={d(defaults.phase)} error={fe.phase} />
        </div>
        <TextAreaField name="legal_description" label="Legal description" defaultValue={d(defaults.legal_description)} error={fe.legal_description} className="sm:col-span-2" />
      </FormSection>

      <FormSection icon={CalendarRangeIcon} title="Plan" description="Budget, target dates, and the project manager responsible.">
        <TextField
          name="estimated_budget"
          label="Estimated budget (USD)"
          inputMode="decimal"
          placeholder="650,000"
          defaultValue={defaults.estimated_budget_cents != null ? String(defaults.estimated_budget_cents / 100) : ''}
          error={fe.estimated_budget}
        />
        <SelectField
          name="project_manager_id"
          label="Project manager"
          options={[{ value: 'none', label: 'Unassigned' }, ...managerOptions]}
          defaultValue={defaults.project_manager_id ?? 'none'}
          error={fe.project_manager_id}
        />
        <TextField name="proposed_start_date" label="Proposed start" type="date" defaultValue={d(defaults.proposed_start_date)} error={fe.proposed_start_date} />
        <TextField name="target_completion_date" label="Target completion" type="date" defaultValue={d(defaults.target_completion_date)} error={fe.target_completion_date} />
        <TextAreaField
          name="internal_notes"
          label="Internal notes"
          hint="Visible to builder staff only, never to homeowners."
          defaultValue={d(defaults.internal_notes)}
          error={fe.internal_notes}
          className="sm:col-span-2"
        />
      </FormSection>

      <FormActions message={<FormMessage state={state} />}>
        <Button variant="outline" size="lg" render={<Link href={cancelHref} />} nativeButton={false}>
          Cancel
        </Button>
        <SubmitButton>{submitLabel}</SubmitButton>
      </FormActions>
    </form>
  )
}
