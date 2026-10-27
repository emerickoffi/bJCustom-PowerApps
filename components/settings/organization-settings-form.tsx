'use client'

import { Building2 as Building2Icon, MapPin as MapPinIcon, Palette as PaletteIcon, Hash as HashIcon } from 'lucide-react'
import { useActionState } from 'react'
import { updateOrganizationAction } from '@/app/actions/organization'
import { initialActionState } from '@/lib/action-state'
import { FormActions, FormSection, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

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
  const [state, formAction] = useActionState(updateOrganizationAction, initialActionState)
  const fe = state.fieldErrors ?? {}
  const d = (v: string | null | undefined) => v ?? ''

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <FormSection icon={Building2Icon} title="Company" description="Names used in the app header, portal, and correspondence.">
        <TextField name="display_name" label="Display name" required defaultValue={d(defaults.display_name)} error={fe.display_name} />
        <TextField name="legal_name" label="Legal name" defaultValue={d(defaults.legal_name)} error={fe.legal_name} />
        <TextField name="phone" label="Phone" type="tel" defaultValue={d(defaults.phone)} error={fe.phone} />
        <TextField name="email" label="Email" type="email" defaultValue={d(defaults.email)} error={fe.email} />
        <TextField name="website" label="Website" defaultValue={d(defaults.website)} error={fe.website} className="sm:col-span-2" />
      </FormSection>

      <FormSection icon={MapPinIcon} title="Office address">
        <TextField name="address_line1" label="Street address" defaultValue={d(defaults.address_line1)} error={fe.address_line1} className="sm:col-span-2" />
        <TextField name="address_line2" label="Suite, etc." defaultValue={d(defaults.address_line2)} error={fe.address_line2} className="sm:col-span-2" />
        <TextField name="city" label="City" defaultValue={d(defaults.city)} error={fe.city} />
        <TextField name="state" label="State" defaultValue={d(defaults.state)} error={fe.state} />
        <TextField name="postal_code" label="ZIP code" defaultValue={d(defaults.postal_code)} error={fe.postal_code} />
      </FormSection>

      <FormSection icon={PaletteIcon} title="Branding" description="Leave the logo blank to use the default B & J Custom Homes logo.">
        <TextField
          name="logo_url"
          label="Logo URL"
          defaultValue={d(defaults.logo_url)}
          error={fe.logo_url}
          placeholder="/branding/bj-custom-homes-logo.png"
          className="sm:col-span-2"
        />
        <TextField name="primary_color" label="Primary color" defaultValue={defaults.primary_color ?? '#174D32'} error={fe.primary_color} hint="Hex, e.g. #174D32" />
        <TextField name="secondary_color" label="Secondary color" defaultValue={defaults.secondary_color ?? '#103B27'} error={fe.secondary_color} hint="Hex, e.g. #103B27" />
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

      <FormActions message={<FormMessage state={state} />}>
        <SubmitButton>Save settings</SubmitButton>
      </FormActions>
    </form>
  )
}
