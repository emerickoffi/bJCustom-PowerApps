'use client'

import { useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, ExternalLink, FolderKanban, Pencil, UserPlus, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/action-state'
import type { CompanyOption, PersonProfile } from '@/lib/contacts-data'
import { personName } from '@/lib/contacts'
import { formatDate, formatPhone } from '@/lib/format'
import { createCompanyAction, createPersonAction, updatePersonAction } from '@/app/actions/contacts'
import { CompanyForm } from '@/components/contacts/company-form'
import { DetailList } from '@/components/shared/page-header'
import { FormOverlay, OverlayBody, OverlayFooter } from '@/components/shared/form-overlay'
import { PersonForm } from '@/components/contacts/person-form'
import { ContactStatusBadge } from '@/components/contacts/contact-status-button'
import type { AssignableProjectOption } from '@/components/contacts/project-assignments-field'

/** Search params that address an overlay, so each one is linkable and survives refresh. */
export const OVERLAY_KEYS = ['new', 'contact', 'edit', 'back'] as const

/** Builds a link to the current page with the given overlay open, keeping filters like ?view=. */
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

export function ContactOverlays({
  companies,
  projects,
  person,
}: {
  companies: CompanyOption[]
  projects: AssignableProjectOption[]
  /** Loaded by the server when ?contact= or ?edit= names a person. */
  person: PersonProfile | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const hrefWith = useOverlayHref()
  const go = useCallback((href: string) => router.replace(href, { scroll: false }), [router])

  const creating = searchParams.get('new') === 'contact'
  const creatingCompany = searchParams.get('new') === 'company'
  const detailsId = searchParams.get('contact')
  const editId = searchParams.get('edit')
  const backToDetails = searchParams.get('back') === 'contact'
  const viewing = Boolean(person && detailsId === person.id)
  const editing = Boolean(person && editId === person.id)

  const closeAll = useCallback(() => go(hrefWith({})), [go, hrefWith])

  const onCreated = useCallback(
    (result: ActionState) => {
      if (result.warning) toast.warning(result.warning)
      else toast.success(result.success ?? 'Contact added.')
      if (result.savedId) go(hrefWith({ contact: result.savedId }))
    },
    [go, hrefWith],
  )

  const onCompanyCreated = useCallback(
    (result: ActionState) => {
      const id = result.savedId
      const open = id ? { label: 'Open profile', onClick: () => router.push(`/contacts/companies/${id}`) } : undefined
      if (result.warning) toast.warning(result.warning, { action: open })
      else toast.success(result.success ?? 'Company added.', { description: 'Add contact persons from its profile.', action: open })
      closeAll()
    },
    [router, closeAll],
  )

  const onEdited = useCallback(
    (result: ActionState) => {
      if (result.warning) toast.warning(result.warning)
      else toast.success(result.success ?? 'Changes saved.')
      go(backToDetails && result.savedId ? hrefWith({ contact: result.savedId }) : hrefWith({}))
    },
    [go, hrefWith, backToDetails],
  )

  return (
    <>
      <FormOverlay
        open={creating}
        onClose={closeAll}
        variant="modal"
        size="lg"
        icon={UserPlus}
        title="Add contact"
        description="Add a person to your business directory. Only first and last name are required."
      >
        {creating && <PersonForm action={createPersonAction} companies={companies} projects={projects} onSaved={onCreated} />}
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
        onClose={() => go(backToDetails && person ? hrefWith({ contact: person.id }) : hrefWith({}))}
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
        open={viewing}
        onClose={closeAll}
        variant="drawer"
        icon={UserRound}
        title={person ? personName(person) : 'Contact'}
        description={person?.specialty ?? 'Business contact'}
      >
        {viewing && person && (
          <>
            <OverlayBody className="flex flex-col gap-6">
              <ContactStatusBadge status={person.status} />
              <DetailList
                items={[
                  {
                    label: 'Email',
                    value: person.email ? (
                      <a href={`mailto:${person.email}`} className="break-all underline-offset-4 hover:underline">
                        {person.email}
                      </a>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Primary phone', value: person.primary_phone ? formatPhone(person.primary_phone) : '—' },
                  { label: 'Secondary phone', value: person.secondary_phone ? formatPhone(person.secondary_phone) : '—' },
                  { label: 'Added', value: formatDate(person.created_at) },
                ]}
              />
              <SummaryList
                icon={Building2}
                title="Companies"
                empty="Independent. Not linked to a company."
                items={person.relationships
                  .filter((r) => r.status === 'active')
                  .map((r) => ({ id: r.id, href: `/contacts/companies/${r.company_id}`, label: r.company_name, meta: r.is_primary_contact ? 'Primary contact' : r.role }))}
              />
              <SummaryList
                icon={FolderKanban}
                title="Active projects"
                empty="Not assigned to any active project."
                items={person.projects
                  .filter((p) => p.status === 'active')
                  .map((p) => ({ id: p.id, href: `/projects/${p.project_id}`, label: p.project_number ? `${p.project_number} · ${p.name}` : p.name, meta: p.project_role }))}
              />
              {person.notes && (
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Notes</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{person.notes}</p>
                </div>
              )}
            </OverlayBody>
            <OverlayFooter>
              <Button variant="outline" size="lg" render={<Link href={`/contacts/people/${person.id}`} />} nativeButton={false}>
                <ExternalLink data-icon="inline-start" />
                Full profile
              </Button>
              <Button size="lg" render={<Link href={hrefWith({ edit: person.id, back: 'contact' })} scroll={false} replace />} nativeButton={false}>
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
            </OverlayFooter>
          </>
        )}
      </FormOverlay>
    </>
  )
}

function SummaryList({
  icon: Icon,
  title,
  empty,
  items,
}: {
  icon: typeof Building2
  title: string
  empty: string
  items: { id: string; href: string; label: string; meta: string | null }[]
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/80 bg-card">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <Link href={item.href} className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:text-primary hover:underline">
                {item.label}
              </Link>
              {item.meta && <span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
