'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, FolderKanban, Phone, StickyNote, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { initialActionState, type ActionState } from '@/lib/action-state'
import {
  COMPANY_POSITION_SUGGESTIONS,
  PROFESSIONAL_SPECIALTIES,
  parseProjectAssignments,
  type PendingProjectAssignment,
} from '@/lib/contacts'
import type { CompanyOption } from '@/lib/contacts-data'
import { FormActions, FormSection, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { CompanyCombobox } from '@/components/contacts/company-combobox'
import { QuickCompanyDialog } from '@/components/contacts/quick-company-dialog'
import {
  ProjectAssignmentsField,
  type AssignableProjectOption,
  type CurrentProjectAssignment,
} from '@/components/contacts/project-assignments-field'

type PersonDefaults = {
  id: string
  first_name: string
  last_name: string
  middle_name: string | null
  email: string | null
  primary_phone: string | null
  secondary_phone: string | null
  specialty: string | null
  notes: string | null
  updated_at: string
}

export type CurrentCompanyLink = { company_id: string; company_name: string; role: string | null; is_primary_contact: boolean }

export function PersonForm({
  action,
  cancelHref,
  companies,
  projects,
  person,
  currentCompanies = [],
  currentProjects = [],
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  cancelHref: string
  companies: CompanyOption[]
  projects: AssignableProjectOption[]
  /** Present when editing. */
  person?: PersonDefaults
  currentCompanies?: CurrentCompanyLink[]
  currentProjects?: CurrentProjectAssignment[]
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v: Record<string, string> = state.values ?? {
    first_name: person?.first_name ?? '',
    last_name: person?.last_name ?? '',
    middle_name: person?.middle_name ?? '',
    email: person?.email ?? '',
    primary_phone: person?.primary_phone ?? '',
    secondary_phone: person?.secondary_phone ?? '',
    specialty: person?.specialty ?? '',
    notes: person?.notes ?? '',
  }
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const isEdit = Boolean(person)

  const [createdCompanies, setCreatedCompanies] = useState<CompanyOption[]>([])
  const [companyId, setCompanyId] = useState<string | null>(v.company_id || null)
  const [isPrimary, setIsPrimary] = useState(v.is_primary === 'on')
  const [replacePrimary, setReplacePrimary] = useState(v.replace_primary === 'on')
  const [assignments, setAssignments] = useState<PendingProjectAssignment[]>(() => {
    const parsed = parseProjectAssignments(v.project_assignments)
    return parsed.ok ? parsed.value : []
  })
  const [dialog, setDialog] = useState<{ open: boolean; key: number; name: string }>({ open: false, key: 0, name: '' })

  const linkedIds = useMemo(() => new Set(currentCompanies.map((c) => c.company_id)), [currentCompanies])
  const pickable = useMemo(() => {
    const byId = new Map<string, CompanyOption>()
    for (const c of [...companies, ...createdCompanies]) if (!byId.has(c.id)) byId.set(c.id, c)
    return [...byId.values()]
      .filter((c) => c.status === 'active' && !linkedIds.has(c.id))
      .sort((a, b) => a.company_name.localeCompare(b.company_name))
  }, [companies, createdCompanies, linkedIds])

  const selectedCompany = companyId ? pickable.find((c) => c.id === companyId) : undefined
  const existingPrimary =
    selectedCompany?.primary_contact && selectedCompany.primary_contact.person_id !== person?.id ? selectedCompany.primary_contact : null

  function chooseCompany(id: string | null) {
    setCompanyId(id)
    setIsPrimary(false)
    setReplacePrimary(false)
  }

  return (
    <>
      <form key={formKey} action={formAction} className="flex flex-col gap-5" noValidate>
        {person && <input type="hidden" name="expected_updated_at" value={person.updated_at} />}
        <FormSection icon={User} title="Person" description="Who this contact is and what they do.">
          <TextField name="first_name" label="First name" required defaultValue={v.first_name} error={fe.first_name} autoComplete="given-name" maxLength={80} />
          <TextField name="middle_name" label="Middle name" defaultValue={v.middle_name} error={fe.middle_name} autoComplete="additional-name" maxLength={80} />
          <TextField name="last_name" label="Last name" required defaultValue={v.last_name} error={fe.last_name} autoComplete="family-name" maxLength={80} />
          <TextField
            name="specialty"
            label="Profession / trade"
            defaultValue={v.specialty}
            error={fe.specialty}
            hint="What they do in general, for example Lawyer, Electrician, or Realtor."
            maxLength={120}
            list="specialty-options"
            className="sm:col-span-2"
          />
          <datalist id="specialty-options">
            {PROFESSIONAL_SPECIALTIES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </FormSection>

        <FormSection icon={Phone} title="Contact details" description="All optional. Emails must be unique across your directory.">
          <TextField name="email" label="Email" type="email" defaultValue={v.email} error={fe.email} autoComplete="email" className="sm:col-span-2" />
          <TextField name="primary_phone" label="Primary phone" type="tel" defaultValue={v.primary_phone} error={fe.primary_phone} autoComplete="tel" />
          <TextField name="secondary_phone" label="Secondary phone" type="tel" defaultValue={v.secondary_phone} error={fe.secondary_phone} />
        </FormSection>

        <FormSection
          icon={Building2}
          title="Company"
          description={
            isEdit
              ? 'Optionally link one more company. Change or end existing links from the profile.'
              : 'Optional. Leave blank or choose Independent if this person works on their own.'
          }
        >
          {currentCompanies.length > 0 && (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Current companies</p>
              <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/80">
                {currentCompanies.map((c) => (
                  <li key={c.company_id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{c.company_name}</span>
                    {c.role && <span className="shrink-0 text-muted-foreground">{c.role}</span>}
                    {c.is_primary_contact && (
                      <span className="shrink-0 rounded-full bg-sage px-2 py-0.5 text-xs font-medium text-primary">Primary</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="company_id_search" className="text-sm font-medium text-foreground">
              {currentCompanies.length ? 'Add another company' : 'Company'}
            </label>
            <input type="hidden" name="company_id" value={companyId ?? ''} />
            <CompanyCombobox
              id="company_id_search"
              companies={pickable}
              value={companyId}
              onValueChange={chooseCompany}
              onAddNew={(name) => setDialog((d) => ({ open: true, key: d.key + 1, name }))}
              allowIndependent={!isEdit}
              placeholder={isEdit ? 'Search companies (optional)…' : 'Search companies or choose Independent…'}
              invalid={Boolean(fe.company_id)}
              describedBy={fe.company_id ? 'company_id-error' : 'company_id-hint'}
            />
            {fe.company_id ? (
              <p id="company_id-error" className="text-xs text-destructive">
                {fe.company_id}
              </p>
            ) : (
              <p id="company_id-hint" className="text-xs text-muted-foreground">
                Type to search. Can&apos;t find it? Choose Add New Company without leaving this form.
              </p>
            )}
          </div>

          {selectedCompany && (
            <>
              <TextField
                name="role"
                label={`Position at ${selectedCompany.company_name}`}
                defaultValue={v.role ?? ''}
                error={fe.role}
                hint="Their job at this company, for example Foreman or Account Manager."
                maxLength={120}
                list="company-position-options"
              />
              <datalist id="company-position-options">
                {COMPANY_POSITION_SUGGESTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
              <div className="flex flex-col gap-1.5 sm:pt-7">
                <label className="flex min-h-10 items-center gap-2.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="is_primary"
                    checked={isPrimary}
                    onChange={(e) => {
                      setIsPrimary(e.target.checked)
                      if (!e.target.checked) setReplacePrimary(false)
                    }}
                    className="size-4 accent-primary"
                    aria-describedby={fe.is_primary ? 'is_primary-error' : undefined}
                  />
                  Primary contact for this company
                </label>
                {!existingPrimary && fe.is_primary && (
                  <p id="is_primary-error" className="text-xs text-destructive">
                    {fe.is_primary}
                  </p>
                )}
              </div>
              {isPrimary && existingPrimary && (
                <div
                  className="flex flex-col gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 p-3.5 text-sm text-amber-950 sm:col-span-2 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
                  role="alert"
                >
                  <p className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      <strong className="font-medium">{existingPrimary.name}</strong> is currently the primary contact for{' '}
                      {selectedCompany.company_name}. Saving will make this person the primary contact instead.
                    </span>
                  </p>
                  <label className="flex items-center gap-2.5 pl-6 font-medium">
                    <input
                      type="checkbox"
                      name="replace_primary"
                      checked={replacePrimary}
                      onChange={(e) => setReplacePrimary(e.target.checked)}
                      className="size-4 accent-primary"
                      aria-describedby={fe.is_primary ? 'is_primary-error' : undefined}
                    />
                    Yes, replace {existingPrimary.name} as primary contact
                  </label>
                  {fe.is_primary && (
                    <p id="is_primary-error" className="pl-6 text-xs text-destructive">
                      {fe.is_primary}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </FormSection>

        <FormSection
          icon={FolderKanban}
          title="Projects"
          description="Optional. Assign this person to active projects now, or later from their profile. This does not give them portal access."
        >
          <ProjectAssignmentsField
            projects={projects}
            current={currentProjects}
            value={assignments}
            onChange={setAssignments}
            error={fe.project_assignments}
          />
        </FormSection>

        <FormSection icon={StickyNote} title="Notes" description="Internal only. Notes are never included in exports.">
          <TextAreaField name="notes" label="Notes" defaultValue={v.notes} error={fe.notes} maxLength={2000} className="sm:col-span-2" />
        </FormSection>

        <FormActions message={<FormMessage state={state} />}>
          <Button variant="outline" size="lg" render={<Link href={cancelHref} />} nativeButton={false}>
            Cancel
          </Button>
          <SubmitButton pendingLabel={isEdit ? 'Saving changes…' : 'Saving contact…'}>{isEdit ? 'Save changes' : 'Add contact'}</SubmitButton>
        </FormActions>
      </form>

      <QuickCompanyDialog
        key={dialog.key}
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        initialName={dialog.name}
        companies={pickable}
        onSelect={(company, created) => {
          if (created) setCreatedCompanies((list) => [...list, company])
          chooseCompany(company.id)
          setDialog((d) => ({ ...d, open: false }))
        }}
      />
    </>
  )
}
