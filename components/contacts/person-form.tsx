'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Building2, Phone, StickyNote, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { FormActions, FormSection, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

type PersonDefaults = {
  first_name: string
  last_name: string
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  specialty: string | null
  notes: string | null
  updated_at: string
}

export function PersonForm({
  action,
  cancelHref,
  companies,
  person,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  cancelHref: string
  /** Shown only when creating; omit when editing. */
  companies?: { id: string; company_name: string; status: string }[]
  /** Present when editing. */
  person?: PersonDefaults
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v: Record<string, string> = state.values ?? {
    first_name: person?.first_name ?? '',
    last_name: person?.last_name ?? '',
    email: person?.email ?? '',
    primary_phone: person?.primary_phone ?? '',
    secondary_phone: person?.secondary_phone ?? '',
    specialty: person?.specialty ?? '',
    notes: person?.notes ?? '',
    company_id: '',
  }
  const [companyChoice, setCompanyChoice] = useState(v.company_id ?? '')
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const isEdit = Boolean(person)

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-5" noValidate>
      {person && <input type="hidden" name="expected_updated_at" value={person.updated_at} />}
      <FormSection icon={User} title="Person" description="Who this contact is and what they do.">
        <TextField name="first_name" label="First name" required defaultValue={v.first_name} error={fe.first_name} autoComplete="given-name" maxLength={80} />
        <TextField name="last_name" label="Last name" required defaultValue={v.last_name} error={fe.last_name} autoComplete="family-name" maxLength={80} />
        <TextField
          name="specialty"
          label="Specialty"
          defaultValue={v.specialty}
          error={fe.specialty}
          hint="For example Architect, Structural Engineer, or Sales Rep."
          maxLength={120}
          className="sm:col-span-2"
        />
      </FormSection>

      <FormSection icon={Phone} title="Contact details" description="All optional. Emails must be unique across your directory.">
        <TextField name="email" label="Email" type="email" defaultValue={v.email} error={fe.email} autoComplete="email" className="sm:col-span-2" />
        <TextField name="primary_phone" label="Primary phone" type="tel" defaultValue={v.primary_phone} error={fe.primary_phone} autoComplete="tel" />
        <TextField name="secondary_phone" label="Secondary phone" type="tel" defaultValue={v.secondary_phone} error={fe.secondary_phone} />
      </FormSection>

      {companies && (
        <FormSection icon={Building2} title="Company" description="Optional. People can work independently or with several companies; add more from their profile.">
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label htmlFor="company_id" className="text-sm font-medium text-foreground">
              Company
            </label>
            <select
              id="company_id"
              name="company_id"
              value={companyChoice}
              onChange={(e) => setCompanyChoice(e.target.value)}
              aria-invalid={fe.company_id ? true : undefined}
              className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Independent (no company)</option>
              <option value="__new">+ Create a new company</option>
              {companies
                .filter((c) => c.status === 'active')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name}
                  </option>
                ))}
            </select>
            {fe.company_id && <p className="text-xs text-destructive">{fe.company_id}</p>}
          </div>
          {companyChoice === '__new' && (
            <TextField name="new_company_name" label="New company name" required defaultValue={v.new_company_name ?? ''} error={fe.new_company_name} maxLength={160} className="sm:col-span-2" />
          )}
          {companyChoice && (
            <>
              <TextField name="role" label="Role at company" defaultValue={v.role ?? ''} error={fe.role} hint="For example Owner, Estimator, or Office Contact." maxLength={120} />
              <label className="flex items-center gap-2.5 self-end pb-2.5 text-sm text-foreground">
                <input type="checkbox" name="is_primary" defaultChecked={v.is_primary === 'on'} className="size-4 accent-primary" />
                Primary contact for this company
              </label>
            </>
          )}
        </FormSection>
      )}

      <FormSection icon={StickyNote} title="Notes" description="Internal only. Notes are never included in exports.">
        <TextAreaField name="notes" label="Notes" defaultValue={v.notes} error={fe.notes} maxLength={2000} className="sm:col-span-2" />
      </FormSection>

      <FormActions message={<FormMessage state={state} />}>
        <Button variant="outline" size="lg" render={<Link href={cancelHref} />}>
          Cancel
        </Button>
        <SubmitButton pendingLabel={isEdit ? 'Saving changes…' : 'Saving contact…'}>{isEdit ? 'Save changes' : 'Add contact'}</SubmitButton>
      </FormActions>
    </form>
  )
}
