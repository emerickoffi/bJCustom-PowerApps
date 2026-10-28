'use client'

import { Building2 as Building2Icon, MapPin as MapPinIcon, Hash as HashIcon, CircleDot } from 'lucide-react'
import { useActionState, useState } from 'react'
import { updateOrganizationAction } from '@/app/actions/organization'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { FormActions, FormSection, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { CompanyBrandingSection } from '@/components/settings/company-branding-section'

type Defaults = {
  display_name?: string
  legal_name?: string | null
  logo_url?: string | null
  primary_color?: string
  secondary_color?: string
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  project_number_prefix?: string
}

export function OrganizationSettingsForm({
  defaults,
  nextProjectNumber,
  nextClientNumber,
}: {
  defaults: Defaults
  nextProjectNumber: number | null
  nextClientNumber: number | null
}) {
  const [dirty, setDirty] = useState(false)
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateOrganizationAction(prev, formData)
    if (result.success) setDirty(false)
    return result
  }, initialActionState)
  const fe = state.fieldErrors ?? {}
  const d = (v: string | null | undefined) => v ?? ''

  return (
    <form action={formAction} onInput={() => setDirty(true)} onChange={() => setDirty(true)} className="flex flex-col gap-5">
      <FormSection icon={Building2Icon} title="Company Profile" description="Names and contact details used in the app header, portal, and correspondence.">
        <TextField name="display_name" label="Display name" required defaultValue={d(defaults.display_name)} error={fe.display_name} />
        <TextField name="legal_name" label="Legal name" defaultValue={d(defaults.legal_name)} error={fe.legal_name} />
        <TextField name="phone" label="Phone" type="tel" autoComplete="tel" defaultValue={d(defaults.phone)} error={fe.phone} />
        <TextField name="email" label="Email" type="email" autoComplete="email" defaultValue={d(defaults.email)} error={fe.email} />
        <TextField name="website" label="Website" autoComplete="url" defaultValue={d(defaults.website)} error={fe.website} className="sm:col-span-2" />
      </FormSection>

      <CompanyBrandingSection defaults={defaults} displayName={defaults.display_name || 'Your company'} errors={fe} />

      <FormSection icon={MapPinIcon} title="Office Address" description="Your main office. Client and project addresses are managed separately.">
        <TextField name="address_line1" label="Street address" autoComplete="address-line1" defaultValue={d(defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField name="address_line2" label="Suite / Unit" autoComplete="address-line2" defaultValue={d(defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <div className="grid gap-5 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
          <TextField name="city" label="City" autoComplete="address-level2" defaultValue={d(defaults.city)} error={fe.city} className="sm:col-span-2 lg:col-span-1" />
          <TextField name="state" label="State" autoComplete="address-level1" defaultValue={d(defaults.state)} error={fe.state} />
          <TextField name="postal_code" label="ZIP code" autoComplete="postal-code" defaultValue={d(defaults.postal_code)} error={fe.postal_code} />
        </div>
      </FormSection>

      <FormSection icon={HashIcon} title="Numbering" description="Applied to newly created records. Existing numbers never change.">
        <TextField
          name="project_number_prefix"
          label="Project number prefix"
          defaultValue={defaults.project_number_prefix ?? 'P'}
          error={fe.project_number_prefix}
          hint={nextProjectNumber ? `Next project: ${defaults.project_number_prefix ?? 'P'}-${nextProjectNumber}` : undefined}
        />
        <div className="flex flex-col justify-end gap-1 text-sm text-muted-foreground">
          {nextClientNumber && <span>{`Next client number: #${nextClientNumber}`}</span>}
        </div>
      </FormSection>

      <div>
        <FormActions
          message={<FormMessage state={dirty && state.success ? initialActionState : state} />}
          note={dirty ? 'You have unsaved changes.' : 'Fields marked * are required.'}
        >
          {dirty && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 sm:hidden">
              <CircleDot className="size-3" aria-hidden="true" />
              Unsaved changes
            </span>
          )}
          <SubmitButton pendingLabel="Saving changes...">Save Changes</SubmitButton>
        </FormActions>
      </div>
    </form>
  )
}
