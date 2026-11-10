'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { Building2, Pencil, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { ActionState } from '@/lib/action-state'
import type { CompanyOption, CompanyProfile, PersonProfile } from '@/lib/contacts-data'
import { personName } from '@/lib/contacts'
import { isContactPreviewKey } from '@/lib/record-preview'
import { createCompanyAction, createPersonAction, updateCompanyAction, updatePersonAction } from '@/app/actions/contacts'
import { CompanyForm } from '@/components/contacts/company-form'
import { FormOverlay } from '@/components/shared/form-overlay'
import { PersonForm } from '@/components/contacts/person-form'
import type { AssignableProjectOption } from '@/components/contacts/project-assignments-field'

/** Search params that address a form overlay, so each one is linkable and survives refresh. */
export const OVERLAY_KEYS = ['new', 'edit', 'editCompany'] as const

/** Builds a link to the current page with the given overlay open, keeping filters like ?view= and the open preview. */
export function useOverlayHref() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  return useCallback(
    (next: Partial<Record<(typeof OVERLAY_KEYS)[number], string>>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const key of OVERLAY_KEYS) params.delete(key)
      for (const [key, value] of Object.entries(next)) if (value) params.set(key, value)
      const qs = params.toString()
      return qs ? `${pathname}?${qs}` : pathname
    },
    [pathname, searchParams],
  )
}

/**
 * The directory's create and edit forms. Only one is ever open, and the list's preview drawer steps aside for it,
 * so overlays never stack. Closing or saving returns to the same list with its filters and selection.
 */
export function ContactOverlays({
  companies,
  projects,
  person,
  company,
}: {
  companies: CompanyOption[]
  projects: AssignableProjectOption[]
  /** Loaded by the server when ?edit= names a person. */
  person: PersonProfile | null
  /** Loaded by the server when ?editCompany= names a company. */
  company: CompanyProfile | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hrefWith = useOverlayHref()
  const { mutate } = useSWRConfig()

  const creating = searchParams.get('new') === 'contact'
  const creatingCompany = searchParams.get('new') === 'company'
  const editing = Boolean(person && searchParams.get('edit') === person.id)
  const editingCompany = Boolean(company && searchParams.get('editCompany') === company.id)

  const closeAll = useCallback(() => router.replace(hrefWith({}), { scroll: false }), [router, hrefWith])

  /** The new record may fall outside the current filters or page, so the confirmation carries a direct way to open it. */
  const onCreated = useCallback(
    (kind: 'contact' | 'company', result: ActionState) => {
      const id = result.savedId
      const href = kind === 'contact' ? `/contacts/people/${id}` : `/contacts/companies/${id}`
      const action = id ? { label: kind === 'contact' ? 'Open contact' : 'Open company', onClick: () => router.push(href) } : undefined
      if (result.warning) toast.warning(result.warning, { action })
      else if (kind === 'contact') toast.success(result.success ?? 'Contact added.', { action })
      else toast.success(result.success ?? 'Company added.', { description: 'Add contact persons from its profile.', action })
      closeAll()
    },
    [router, closeAll],
  )
  const onPersonCreated = useCallback((result: ActionState) => onCreated('contact', result), [onCreated])
  const onCompanyCreated = useCallback((result: ActionState) => onCreated('company', result), [onCreated])

  const onEdited = useCallback(
    (result: ActionState) => {
      if (result.warning) toast.warning(result.warning)
      else toast.success(result.success ?? 'Changes saved.')
      // An edit can change what any open preview shows: a person's own details, or their name under a company.
      void mutate(isContactPreviewKey)
      closeAll()
    },
    [mutate, closeAll],
  )

  return (
    <>
      <FormOverlay
        open={creating}
        onClose={closeAll}
        variant="drawer"
        size="lg"
        icon={UserPlus}
        title="Add contact"
        description="Add a person to your business directory. Only first and last name are required."
      >
        {creating && <PersonForm action={createPersonAction} companies={companies} projects={projects} onSaved={onPersonCreated} />}
      </FormOverlay>

      <FormOverlay
        open={creatingCompany}
        onClose={closeAll}
        variant="drawer"
        size="lg"
        icon={Building2}
        title="Add company"
        description="Add a business to your directory. Only the company name is required."
      >
        {creatingCompany && <CompanyForm action={createCompanyAction} companies={companies} onSaved={onCompanyCreated} />}
      </FormOverlay>

      <FormOverlay
        open={editing}
        onClose={closeAll}
        variant="drawer"
        size="lg"
        icon={Pencil}
        title={person ? `Edit ${personName(person)}` : 'Edit contact'}
        description="Changes save to the directory and every linked project."
      >
        {editing && person && (
          <PersonForm
            key={person.id}
            action={updatePersonAction.bind(null, person.id)}
            person={person}
            companies={companies}
            projects={person.status === 'active' ? projects : []}
            currentCompanies={person.relationships
              .filter((r) => r.status === 'active')
              .map((r) => ({ company_id: r.company_id, company_name: r.company_name, role: r.role, is_primary_contact: r.is_primary_contact }))}
            currentProjects={person.projects
              .filter((p) => p.status === 'active')
              .map((p) => ({ project_id: p.project_id, name: p.name, project_number: p.project_number, project_role: p.project_role }))}
            onSaved={onEdited}
          />
        )}
      </FormOverlay>

      <FormOverlay
        open={editingCompany}
        onClose={closeAll}
        variant="drawer"
        size="lg"
        icon={Pencil}
        title={company ? `Edit ${company.company_name}` : 'Edit company'}
        description="Changes apply everywhere this company appears."
      >
        {editingCompany && company && (
          <CompanyForm key={company.id} action={updateCompanyAction.bind(null, company.id)} company={company} onSaved={onEdited} />
        )}
      </FormOverlay>
    </>
  )
}
