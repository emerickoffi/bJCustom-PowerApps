'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Building2, MapPin, StickyNote, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from '@/lib/contacts'
import { FormActions, FormSection, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

type CompanyDefaults = {
  company_name: string
  company_email: string | null
  company_phone: string | null
  secondary_company_phone?: string | null
  website?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  notes: string | null
  business_categories: CategoryKey[]
  product_categories: string[]
  subcontractor_company_id: string | null
}

export function CompanyForm({
  action,
  cancelHref,
  company,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  cancelHref: string
  company?: CompanyDefaults
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v: Record<string, string> = state.values ?? {
    company_name: company?.company_name ?? '',
    company_email: company?.company_email ?? '',
    company_phone: company?.company_phone ?? '',
    secondary_company_phone: company?.secondary_company_phone ?? '',
    website: company?.website ?? '',
    address_line1: company?.address_line1 ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    postal_code: company?.postal_code ?? '',
    notes: company?.notes ?? '',
    categories: (company?.business_categories ?? []).join(','),
    product_categories: (company?.product_categories ?? []).join(', '),
  }
  const checked = new Set((v.categories ?? '').split(',').filter(Boolean))
  const linked = Boolean(company?.subcontractor_company_id)
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-5" noValidate>
      <FormSection
        icon={Building2}
        title="Company"
        description={linked ? 'Name, email, and phone come from the linked subcontractor record. Edit them on the Subcontractor page.' : 'The business your team works with.'}
      >
        <TextField name="company_name" label="Company name" required disabled={linked} defaultValue={v.company_name} error={fe.company_name} autoComplete="organization" maxLength={160} className="sm:col-span-2" />
        <TextField name="company_email" label="Email" type="email" disabled={linked} defaultValue={v.company_email} error={fe.company_email} />
        <TextField name="company_phone" label="Phone" type="tel" disabled={linked} defaultValue={v.company_phone} error={fe.company_phone} />
        <TextField name="secondary_company_phone" label="Second phone" type="tel" defaultValue={v.secondary_company_phone} error={fe.secondary_company_phone} />
        <TextField name="website" label="Website" type="url" defaultValue={v.website} error={fe.website} hint="For example example.com" maxLength={200} />
      </FormSection>

      <FormSection icon={MapPin} title="Address" description="Optional. Useful for suppliers and pickup locations.">
        <TextField name="address_line1" label="Street address" defaultValue={v.address_line1} error={fe.address_line1} autoComplete="street-address" maxLength={160} className="sm:col-span-2" />
        <TextField name="city" label="City" defaultValue={v.city} error={fe.city} autoComplete="address-level2" maxLength={80} />
        <TextField name="state" label="State / province" defaultValue={v.state} error={fe.state} autoComplete="address-level1" maxLength={40} />
        <TextField name="postal_code" label="Postal code" defaultValue={v.postal_code} error={fe.postal_code} autoComplete="postal-code" maxLength={20} />
      </FormSection>

      <FormSection icon={Tags} title="Categories" description="Used to filter the directory. A company can belong to several.">
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Business categories</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_KEYS.map((k) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-sage">
                <input type="checkbox" name="categories" value={k} defaultChecked={checked.has(k)} className="size-4 accent-primary" />
                {CATEGORY_LABELS[k]}
              </label>
            ))}
          </div>
          {linked && <p className="text-xs text-muted-foreground">Linked subcontractors always appear under Subcontractors.</p>}
        </fieldset>
        <TextField
          name="product_categories"
          label="Product categories"
          defaultValue={v.product_categories}
          error={fe.product_categories}
          hint="Comma separated, for example Lumber, Windows, Cabinets."
          className="sm:col-span-2"
        />
      </FormSection>

      <FormSection icon={StickyNote} title="Notes" description="Internal only. Notes are never included in exports.">
        <TextAreaField name="notes" label="Notes" defaultValue={v.notes} error={fe.notes} maxLength={2000} className="sm:col-span-2" />
      </FormSection>

      <FormActions message={<FormMessage state={state} />}>
        <Button variant="outline" size="lg" render={<Link href={cancelHref} />} nativeButton={false}>
          Cancel
        </Button>
        <SubmitButton pendingLabel={company ? 'Saving changes…' : 'Saving company…'}>{company ? 'Save changes' : 'Add company'}</SubmitButton>
      </FormActions>
    </form>
  )
}
