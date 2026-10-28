'use client'

import {
  House as HouseIcon,
  MapPin as MapPinIcon,
  CalendarRange as CalendarRangeIcon,
  ListChecks as ListChecksIcon,
  Lock as LockIcon,
} from 'lucide-react'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { PROJECT_TYPE_LABELS } from '@/lib/domain'
import { cn } from '@/lib/utils'
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

const usd = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

function formatBudget(raw: string) {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return raw
  return usd.format(Number(cleaned))
}

export function ProjectForm({
  action,
  defaults = {},
  clientOptions,
  managerOptions,
  submitLabel,
  pendingLabel,
  cancelHref,
  scheduleSetup,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults?: ProjectFormValues
  clientOptions: Option[]
  managerOptions: Option[]
  submitLabel: string
  pendingLabel?: string
  cancelHref: string
  /** Only passed on create. `true` when the Schedule feature is on; `false` shows it as unavailable; omitted hides it. */
  scheduleSetup?: boolean
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const sv = state.values
  // After a failed submit, re-seed every field from what the builder entered so nothing is lost.
  const v = (key: keyof ProjectFormValues, fallback?: string | null) => (sv ? (sv[key] ?? '') : (fallback ?? ''))
  const budgetDefault = sv
    ? (sv.estimated_budget ?? '')
    : defaults.estimated_budget_cents != null
      ? usd.format(defaults.estimated_budget_cents / 100)
      : ''

  const [startDate, setStartDate] = useState(v('proposed_start_date', defaults.proposed_start_date))
  const [scheduleMode, setScheduleMode] = useState(sv?.schedule_setup ?? 'standard')

  return (
    <form key={sv ? JSON.stringify(sv) : 'initial'} action={formAction} className="flex flex-col gap-5" noValidate={false}>
      <FormSection icon={HouseIcon} title="Project" description="Name the project and choose the homeowner it is being built for.">
        <TextField name="name" label="Project name" required defaultValue={v('name', defaults.name)} error={fe.name} className="sm:col-span-2" />
        <SelectField
          name="primary_client_id"
          label="Primary homeowner"
          required
          placeholder="Select a client"
          options={clientOptions}
          defaultValue={v('primary_client_id', defaults.primary_client_id)}
          error={fe.primary_client_id}
          hint={
            clientOptions.length
              ? 'Other contacts on this client get project access only through portal access settings.'
              : 'Create a client first.'
          }
        />
        <SelectField
          name="project_type"
          label="Project type"
          required
          options={Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          defaultValue={v('project_type', defaults.project_type ?? 'new_custom_home')}
          error={fe.project_type}
        />
        <TextAreaField
          name="description"
          label="Description"
          defaultValue={v('description', defaults.description)}
          error={fe.description}
          className="sm:col-span-2"
        />
      </FormSection>

      <FormSection icon={MapPinIcon} title="Site" description="Where the home is being built. This is separate from the homeowner's mailing address.">
        <TextField name="address_line1" label="Street address" required autoComplete="off" defaultValue={v('address_line1', defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField name="address_line2" label="Address line 2" autoComplete="off" defaultValue={v('address_line2', defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-6">
          <TextField name="city" label="City" required defaultValue={v('city', defaults.city)} error={fe.city} className="sm:col-span-3" />
          <TextField name="state" label="State" required defaultValue={v('state', defaults.state)} error={fe.state} className="sm:col-span-1" />
          <TextField name="postal_code" label="ZIP" required inputMode="numeric" defaultValue={v('postal_code', defaults.postal_code)} error={fe.postal_code} className="sm:col-span-2" />
        </div>
        <div className="grid grid-cols-3 gap-5 sm:col-span-2 lg:grid-cols-6">
          <TextField name="community" label="Community / subdivision" defaultValue={v('community', defaults.community)} error={fe.community} className="col-span-3" />
          <TextField name="lot" label="Lot" defaultValue={v('lot', defaults.lot)} error={fe.lot} />
          <TextField name="block" label="Block" defaultValue={v('block', defaults.block)} error={fe.block} />
          <TextField name="phase" label="Phase" defaultValue={v('phase', defaults.phase)} error={fe.phase} />
        </div>
        <TextAreaField name="legal_description" label="Legal description" defaultValue={v('legal_description', defaults.legal_description)} error={fe.legal_description} className="sm:col-span-2" />
      </FormSection>

      <FormSection icon={CalendarRangeIcon} title="Plan" description="Budget, target dates, and the project manager responsible.">
        <div className="flex min-w-0 flex-col">
          <TextField
            name="estimated_budget"
            label="Estimated project budget (USD)"
            inputMode="decimal"
            placeholder="e.g. 650,000"
            defaultValue={budgetDefault}
            error={fe.estimated_budget}
            hint="Optional. Planning figure only; it does not create or change an estimate."
            onBlur={(e) => {
              e.currentTarget.value = formatBudget(e.currentTarget.value)
            }}
          />
        </div>
        <SelectField
          name="project_manager_id"
          label="Project manager"
          options={[{ value: 'none', label: 'Unassigned' }, ...managerOptions]}
          defaultValue={v('project_manager_id', defaults.project_manager_id ?? 'none') || 'none'}
          error={fe.project_manager_id}
          hint={managerOptions.length ? undefined : 'No active admins or project managers in your company yet.'}
        />
        <TextField
          name="proposed_start_date"
          label="Proposed start"
          type="date"
          defaultValue={startDate}
          onChange={(e) => setStartDate(e.currentTarget.value)}
          error={fe.proposed_start_date}
        />
        <TextField
          name="target_completion_date"
          label="Target completion"
          type="date"
          min={startDate || undefined}
          defaultValue={v('target_completion_date', defaults.target_completion_date)}
          error={fe.target_completion_date}
          hint="Must be on or after the proposed start."
        />
        <TextAreaField
          name="internal_notes"
          label="Internal notes"
          hint="Visible to builder staff only, never to homeowners."
          defaultValue={v('internal_notes', defaults.internal_notes)}
          error={fe.internal_notes}
          className="sm:col-span-2"
        />
      </FormSection>

      {scheduleSetup !== undefined && (
        <FormSection
          icon={ListChecksIcon}
          title="Construction schedule setup"
          description="Optional. Runs once after the project is saved, and you can change it later on the Schedule page."
        >
          {scheduleSetup ? (
            <>
              <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-foreground">Schedule</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { value: 'standard', label: 'Use standard construction schedule', hint: 'Adds the standard B & J activities by phase.' },
                    { value: 'later', label: 'Configure later', hint: 'Start with an empty schedule.' },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border bg-background p-3 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50',
                        scheduleMode === opt.value ? 'border-primary bg-sage/60' : 'border-input hover:border-primary/40',
                      )}
                    >
                      <input
                        type="radio"
                        name="schedule_setup"
                        value={opt.value}
                        checked={scheduleMode === opt.value}
                        onChange={() => setScheduleMode(opt.value)}
                        className="mt-0.5 size-4 accent-primary"
                      />
                      <span className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                        <span className="text-xs leading-relaxed text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label
                className={cn(
                  'flex min-h-11 items-start gap-3 rounded-lg border border-input bg-background p-3 sm:col-span-2',
                  scheduleMode === 'standard' ? 'cursor-pointer' : 'cursor-not-allowed opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  name="include_sprinkler"
                  defaultChecked={sv?.include_sprinkler === 'on'}
                  disabled={scheduleMode !== 'standard'}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">Include Sprinkler / Irrigation Installation</span>
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Lawn irrigation (not a fire-sprinkler system), added to the Exterior phase before Landscaping.
                  </span>
                </span>
              </label>
            </>
          ) : (
            <p className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground sm:col-span-2">
              <LockIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              The Schedule module is turned off for your company, so no schedule is created.
            </p>
          )}
        </FormSection>
      )}

      <FormActions message={<FormMessage state={state} />}>
        <Button variant="outline" size="lg" render={<Link href={cancelHref} />} nativeButton={false}>
          Cancel
        </Button>
        <SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>
      </FormActions>
    </form>
  )
}
