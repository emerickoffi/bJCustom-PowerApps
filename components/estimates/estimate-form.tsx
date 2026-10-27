'use client'

import { House as HouseIcon, FileText as FileTextIcon, Percent as PercentIcon } from 'lucide-react'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FormActions, FormSection, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { initialActionState, type ActionState } from '@/lib/action-state'

export type EstimateProjectOption = {
  id: string
  label: string
  clientName: string | null
}

export type EstimateFormDefaults = {
  project_id?: string
  name?: string
  description?: string | null
  estimate_date?: string
  expiration_date?: string | null
  markup_percent?: string
  contingency_percent?: string
  land_cost?: string
  notes?: string | null
  is_demo?: boolean
}

export function EstimateForm({
  action,
  defaults,
  projects,
  estimateNumber,
  cancelHref,
  submitLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults: EstimateFormDefaults
  projects?: EstimateProjectOption[]
  estimateNumber?: string
  cancelHref: string
  submitLabel: string
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}
  const [projectId, setProjectId] = useState(v.project_id ?? defaults.project_id ?? '')
  const selected = projects?.find((p) => p.id === projectId)

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormSection
        icon={HouseIcon} title="Project & client"
        description="Estimates attach to an existing project. The homeowner is taken from the project's primary client."
      >
        {projects ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="project_id" className="text-sm font-medium leading-none">
              Project
              <span className="text-destructive" aria-hidden="true">
                {' *'}
              </span>
            </label>
            <select
              id="project_id"
              name="project_id"
              required
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              aria-invalid={fe.project_id ? true : undefined}
              className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
            >
              <option value="" disabled>
                Select a project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {fe.project_id && <p className="text-xs text-destructive">{fe.project_id}</p>}
          </div>
        ) : null}
        <div className="flex flex-col gap-1 rounded-lg bg-sage/50 px-3 py-2.5 sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Client (from project)</span>
          <span className="text-sm font-medium text-foreground">
            {projects
              ? selected
                ? (selected.clientName ?? 'No primary client linked to this project')
                : 'Select a project'
              : (defaults.project_id && 'Set by the project') || '—'}
          </span>
        </div>
      </FormSection>

      <FormSection icon={FileTextIcon} title="Estimate details">
        <TextField
          name="name"
          label="Estimate name"
          required
          defaultValue={v.name ?? defaults.name ?? ''}
          error={fe.name}
          placeholder="e.g. Base construction estimate"
          className="sm:col-span-2"
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium leading-none">Estimate number</span>
          <span className="flex h-10 items-center rounded-lg border border-dashed border-input bg-muted/40 px-2.5 font-mono text-sm text-muted-foreground">
            {estimateNumber ?? 'Assigned automatically (EST-0001…)'}
          </span>
        </div>
        <TextField
          name="estimate_date"
          label="Estimate date"
          type="date"
          required
          defaultValue={v.estimate_date ?? defaults.estimate_date ?? ''}
          error={fe.estimate_date}
        />
        <TextField
          name="expiration_date"
          label="Expiration date"
          type="date"
          defaultValue={v.expiration_date ?? defaults.expiration_date ?? ''}
          error={fe.expiration_date}
          hint="Optional"
        />
        <TextAreaField
          name="description"
          label="Description"
          defaultValue={v.description ?? defaults.description ?? ''}
          error={fe.description}
          className="sm:col-span-2"
        />
      </FormSection>

      <FormSection
        icon={PercentIcon} title="Markup, contingency & land"
        description="Markup applies to direct costs. Contingency applies to direct costs, allowances and markup. Land is shown separately from construction cost."
      >
        <TextField
          name="markup_percent"
          label="Markup (%)"
          inputMode="decimal"
          defaultValue={v.markup_percent ?? defaults.markup_percent ?? '0'}
          error={fe.markup_percent}
        />
        <TextField
          name="contingency_percent"
          label="Contingency (%)"
          inputMode="decimal"
          defaultValue={v.contingency_percent ?? defaults.contingency_percent ?? '0'}
          error={fe.contingency_percent}
        />
        <TextField
          name="land_cost"
          label="Land cost (USD)"
          inputMode="decimal"
          defaultValue={v.land_cost ?? defaults.land_cost ?? ''}
          error={fe.land_cost}
          hint="Optional. Not included in the construction total."
        />
        <SelectField
          name="is_demo"
          label="Data type"
          defaultValue={(v.is_demo ?? (defaults.is_demo ? 'on' : '')) === 'on' ? 'on' : ''}
          options={[
            { value: '', label: 'Builder-entered amounts' },
            { value: 'on', label: 'Demo / sample data (labeled)' },
          ]}
        />
        <TextAreaField
          name="notes"
          label="Notes"
          defaultValue={v.notes ?? defaults.notes ?? ''}
          error={fe.notes}
          hint="Shown on the printed estimate."
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
