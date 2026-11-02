'use client'

import { UserRound as UserRoundIcon, Phone as PhoneIcon, MapPin as MapPinIcon, ClipboardList as ClipboardListIcon, Folder as FolderIcon } from 'lucide-react'
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
  projectOptions,
}: {
  pendingLabel?: string
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  defaults?: ClientFormValues
  submitLabel: string
  cancelHref: string
  additionalContacts?: boolean
  /** Unassigned projects the new client can become the primary homeowner of. */
  projectOptions?: { value: string; label: string }[]
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
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
        <ClientFormFields
          defaults={defaults}
          fieldErrors={fe}
          flat={flat}
          additionalContacts={additionalContacts ? { values: state.values } : undefined}
        />
        {projectOptions && (
          <FormSection
            flat={flat}
            icon={FolderIcon}
            title="Project"
            description="Optionally make this client the primary homeowner of a project that has none yet."
          >
            <SelectField
              name="assign_project_id"
              label="Assign to project"
              defaultValue={state.values?.assign_project_id || 'none'}
              error={fe.assign_project_id}
              options={[{ value: 'none', label: 'No project' }, ...projectOptions]}
              hint={projectOptions.length === 0 ? 'All projects already have a primary homeowner.' : undefined}
              className="sm:col-span-2"
            />
          </FormSection>
        )}
      </SmartFormLayout>
    </form>
  )
}

/**
 * The client record fields, shared by the client pages and the inline "Create new client" dialog.
 * `idPrefix` keeps element ids unique when these fields render next to another form.
 */
export function ClientFormFields({
  defaults,
  fieldErrors: fe,
  flat,
  idPrefix,
  additionalContacts,
}: {
  defaults: ClientFormValues
  fieldErrors: Record<string, string>
  flat?: boolean
  idPrefix?: string
  additionalContacts?: { values?: Record<string, string> }
}) {
  const d = (v: string | null | undefined) => v ?? ''
  const id = (name: string) => (idPrefix ? `${idPrefix}${name}` : undefined)

  return (
    <>
      <FormSection flat={flat} icon={UserRoundIcon} title="Homeowner information" description="The primary person this client record represents.">
        <TextField id={id('first_name')} name="first_name" label="First name" required defaultValue={d(defaults.first_name)} error={fe.first_name} autoComplete="off" />
        <TextField id={id('middle_name')} name="middle_name" label="Middle name" defaultValue={d(defaults.middle_name)} error={fe.middle_name} autoComplete="off" />
        <TextField id={id('last_name')} name="last_name" label="Last name" required defaultValue={d(defaults.last_name)} error={fe.last_name} autoComplete="off" />
        <TextField id={id('company_name')} name="company_name" label="Company or trust" defaultValue={d(defaults.company_name)} error={fe.company_name} hint="Optional, if the home is owned by an entity." />
      </FormSection>

      <FormSection flat={flat} icon={PhoneIcon} title="Contact details" description="How your team reaches this homeowner.">
        <TextField id={id('email')} name="email" label="Email" type="email" defaultValue={d(defaults.email)} error={fe.email} hint="Required to invite them to the homeowner portal." />
        <SelectField
          id={id('preferred_communication')}
          name="preferred_communication"
          label="Preferred contact"
          defaultValue={defaults.preferred_communication ?? 'email'}
          options={Object.entries(COMMUNICATION_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <TextField id={id('phone')} name="phone" label="Phone" type="tel" defaultValue={d(defaults.phone)} error={fe.phone} />
        <TextField id={id('alternate_phone')} name="alternate_phone" label="Alternate phone" type="tel" defaultValue={d(defaults.alternate_phone)} error={fe.alternate_phone} />
      </FormSection>

      <FormSection flat={flat} icon={MapPinIcon} title="Mailing address" description="Where the homeowner currently lives, not the build site.">
        <TextField id={id('address_line1')} name="address_line1" label="Street address" defaultValue={d(defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField id={id('address_line2')} name="address_line2" label="Apt, suite, etc." defaultValue={d(defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <TextField id={id('city')} name="city" label="City" defaultValue={d(defaults.city)} error={fe.city} />
        <TextField id={id('state')} name="state" label="State" defaultValue={d(defaults.state)} error={fe.state} />
        <TextField id={id('postal_code')} name="postal_code" label="ZIP code" defaultValue={d(defaults.postal_code)} error={fe.postal_code} />
        <TextField id={id('country')} name="country" label="Country" defaultValue={defaults.country ?? 'United States'} error={fe.country} />
      </FormSection>

      {additionalContacts && <AdditionalContactsSection values={additionalContacts.values} fieldErrors={fe} flat={flat} />}

      <FormSection flat={flat} icon={ClipboardListIcon} title="Internal notes & record" description="Status and internal notes are only visible to your team.">
        <SelectField
          id={id('status')}
          name="status"
          label="Client status"
          defaultValue={defaults.status ?? 'active'}
          options={Object.entries(CLIENT_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <div className="hidden sm:block" />
        <TextAreaField id={id('notes')} name="notes" label="Internal notes" defaultValue={d(defaults.notes)} error={fe.notes} className="sm:col-span-2" />
      </FormSection>
    </>
  )
}
