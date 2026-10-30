'use client'

import { UserRound as UserRoundIcon, Phone as PhoneIcon, MapPin as MapPinIcon, ClipboardList as ClipboardListIcon } from 'lucide-react'
import { useActionState } from 'react'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { CLIENT_STATUS_LABELS, COMMUNICATION_LABELS } from '@/lib/domain'
import { FormSection, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { AdditionalContactsSection } from '@/components/clients/additional-contacts-section'
import { SmartFormLayout, useSmartForm } from '@/components/shared/smart-form'

export type ClientFormValues = {
  first_name?: string
  middle_name?: string | null
  last_name?: string
  company_name?: string | null
  email?: string | null
  phone?: string | null
  alternate_phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  preferred_communication?: string
  status?: string
  notes?: string | null
}

export function ClientForm({
  action,
  defaults: initialDefaults = {},
  submitLabel,
  pendingLabel,
  cancelHref,
  additionalContacts = false,
}: {
  pendingLabel?: string
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults?: ClientFormValues
  submitLabel: string
  cancelHref: string
  additionalContacts?: boolean
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const d = (v: string | null | undefined) => v ?? ''
  const defaults: ClientFormValues = { ...initialDefaults, ...state.values }
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const { inOverlay: flat, dirty, formProps } = useSmartForm(state, formKey)

  return (
    <form key={formKey} action={formAction} {...formProps}>
      <SmartFormLayout
        dirty={dirty}
        cancelHref={cancelHref}
        message={<FormMessage state={state} />}
        submit={<SubmitButton pendingLabel={pendingLabel}>{submitLabel}</SubmitButton>}
      >
      <FormSection flat={flat} icon={UserRoundIcon} title="Homeowner information" description="The primary person this client record represents.">
        <TextField name="first_name" label="First name" required defaultValue={d(defaults.first_name)} error={fe.first_name} autoComplete="off" />
        <TextField name="middle_name" label="Middle name" defaultValue={d(defaults.middle_name)} error={fe.middle_name} autoComplete="off" />
        <TextField name="last_name" label="Last name" required defaultValue={d(defaults.last_name)} error={fe.last_name} autoComplete="off" />
        <TextField name="company_name" label="Company or trust" defaultValue={d(defaults.company_name)} error={fe.company_name} hint="Optional, if the home is owned by an entity." />
      </FormSection>

      <FormSection flat={flat} icon={PhoneIcon} title="Contact details" description="How your team reaches this homeowner.">
        <TextField name="email" label="Email" type="email" defaultValue={d(defaults.email)} error={fe.email} hint="Required to invite them to the homeowner portal." />
        <SelectField
          name="preferred_communication"
          label="Preferred contact"
          defaultValue={defaults.preferred_communication ?? 'email'}
          options={Object.entries(COMMUNICATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextField name="phone" label="Phone" type="tel" defaultValue={d(defaults.phone)} error={fe.phone} />
        <TextField name="alternate_phone" label="Alternate phone" type="tel" defaultValue={d(defaults.alternate_phone)} error={fe.alternate_phone} />
      </FormSection>

      <FormSection flat={flat} icon={MapPinIcon} title="Mailing address" description="Where the homeowner currently lives, not the build site.">
        <TextField name="address_line1" label="Street address" defaultValue={d(defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField name="address_line2" label="Apt, suite, etc." defaultValue={d(defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <TextField name="city" label="City" defaultValue={d(defaults.city)} error={fe.city} />
        <TextField name="state" label="State" defaultValue={d(defaults.state)} error={fe.state} />
        <TextField name="postal_code" label="ZIP code" defaultValue={d(defaults.postal_code)} error={fe.postal_code} />
        <TextField name="country" label="Country" defaultValue={defaults.country ?? 'United States'} error={fe.country} />
      </FormSection>

      {additionalContacts && <AdditionalContactsSection values={state.values} fieldErrors={fe} flat={flat} />}

      <FormSection flat={flat} icon={ClipboardListIcon} title="Internal notes & record" description="Status and internal notes are only visible to your team.">
        <SelectField
          name="status"
          label="Client status"
          defaultValue={defaults.status ?? 'active'}
          options={Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <div className="hidden sm:block" />
        <TextAreaField name="notes" label="Internal notes" defaultValue={d(defaults.notes)} error={fe.notes} className="sm:col-span-2" />
      </FormSection>

      </SmartFormLayout>
    </form>
  )
}
