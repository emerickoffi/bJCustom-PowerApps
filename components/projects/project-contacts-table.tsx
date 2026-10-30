'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Plus, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/shared/form-field'
import { formatDate, formatPhone } from '@/lib/format'
import type { AssignablePerson, ProjectCompanyContacts, ProjectContact } from '@/lib/project-contacts-data'
import { endPersonProjectAction } from '@/app/actions/contacts'
import { AssignDialog, type Prefill } from '@/components/projects/project-contacts-panel'

type DialogState = { prefill: Prefill; mode: 'existing' | 'new' } | null

const TH = 'px-3 py-2.5 text-left text-xs font-medium text-muted-foreground'
const TD = 'px-3 py-2.5 align-middle'

function StatusPill({ contact }: { contact: ProjectContact }) {
  if (contact.status === 'ended') {
    return <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">Ended</span>
  }
  if (contact.person_status === 'inactive') {
    return <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive contact</span>
  }
  return <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Active</span>
}

function Dash() {
  return <span className="text-muted-foreground">{'—'}</span>
}

export function ProjectContactsTable({
  projectId,
  contacts,
  companies,
  assignable,
  canEdit,
  acceptsAssignments,
}: {
  projectId: string
  contacts: ProjectContact[]
  companies: ProjectCompanyContacts[]
  assignable: AssignablePerson[]
  canEdit: boolean
  acceptsAssignments: boolean
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [, startEnd] = useTransition()

  const roles = useMemo(() => [...new Set(contacts.map((c) => c.project_role))].sort(), [contacts])
  const activeCount = contacts.filter((c) => c.status === 'active').length
  const endedCount = contacts.length - activeCount
  const activePersonIds = useMemo(() => new Set(contacts.filter((c) => c.status === 'active').map((c) => c.person_id)), [contacts])
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts
      .filter(
        (c) =>
          (showHistory ? c.status === 'ended' : c.status === 'active') &&
          (!roleFilter || c.project_role === roleFilter) &&
          (!q ||
            [c.first_name, c.last_name, c.name, c.company_name, c.email, c.project_role, c.primary_phone, c.secondary_phone].some((v) =>
              v?.toLowerCase().includes(q),
            )),
      )
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name))
  }, [contacts, query, roleFilter, showHistory])
  const canAssign = canEdit && acceptsAssignments

  function end(id: string, name: string) {
    if (!window.confirm(`End ${name}'s association with this project? It stays in the project history.`)) return
    setEndingId(id)
    startEnd(async () => {
      const r = await endPersonProjectAction(id)
      setEndingId(null)
      if (r.error) toast.error(r.error)
      else {
        toast.success(r.success ?? 'Association ended.')
        router.refresh()
      }
    })
  }

  function actions(c: ProjectContact) {
    return (
      <div className="flex items-center justify-end gap-3 text-xs font-medium">
        <Link href={`/contacts/people/${c.person_id}`} className="text-primary underline-offset-4 hover:underline">
          View
        </Link>
        {canEdit && c.status === 'active' && (
          <button
            type="button"
            onClick={() => end(c.association_id, c.name)}
            disabled={endingId === c.association_id}
            className="text-muted-foreground underline-offset-4 hover:text-destructive hover:underline disabled:opacity-50"
          >
            {endingId === c.association_id ? 'Ending...' : 'End'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="pc-table-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="pc-table-heading" className="text-sm font-semibold text-foreground">
              Assigned people
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
              {showHistory
                ? `${visible.length} of ${endedCount} past ${endedCount === 1 ? 'association' : 'associations'}`
                : `${visible.length} of ${activeCount} active ${activeCount === 1 ? 'contact' : 'contacts'}`}
            </p>
          </div>
          {canAssign && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog({ prefill: null, mode: 'new' })}>
                <UserPlus data-icon="inline-start" />
                Create and assign
              </Button>
              <Button size="sm" onClick={() => setDialog({ prefill: null, mode: 'existing' })}>
                <Plus data-icon="inline-start" />
                Add existing contact
              </Button>
            </div>
          )}
        </div>
        {canEdit && !acceptsAssignments && (
          <p className="text-xs text-muted-foreground">This project is closed to new assignments. Existing associations remain visible.</p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="pc-search" className="sr-only">
              Search project contacts
            </label>
            <Input
              id="pc-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, company, role, email, or phone"
              className="h-9 pl-8"
            />
          </div>
          <label htmlFor="pc-role" className="sr-only">
            Filter by project role
          </label>
          <NativeSelect id="pc-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 sm:w-56">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
          <div role="group" aria-label="Association status" className="inline-flex h-9 rounded-lg border border-border p-0.5">
            {[
              { v: false, l: `Active (${activeCount})` },
              { v: true, l: `History (${endedCount})` },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                aria-pressed={showHistory === o.v}
                onClick={() => setShowHistory(o.v)}
                className={
                  showHistory === o.v
                    ? 'flex-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground'
                    : 'flex-1 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            {contacts.length === 0
              ? 'No directory contacts are assigned to this project yet.'
              : showHistory
                ? 'No past associations match these filters.'
                : 'No active contacts match these filters.'}
          </p>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th scope="col" className={TH}>First name</th>
                    <th scope="col" className={TH}>Last name</th>
                    <th scope="col" className={TH}>Company</th>
                    <th scope="col" className={TH}>Role</th>
                    <th scope="col" className={TH}>Email</th>
                    <th scope="col" className={TH}>Primary phone</th>
                    <th scope="col" className={TH}>Secondary phone</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={`${TH} text-right`}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((c) => (
                    <tr key={c.association_id} className="hover:bg-muted/30">
                      <td className={`${TD} font-medium`}>{c.first_name || <Dash />}</td>
                      <td className={`${TD} font-medium`}>
                        <Link href={`/contacts/people/${c.person_id}`} className="underline-offset-4 hover:text-primary hover:underline">
                          {c.last_name}
                        </Link>
                      </td>
                      <td className={`${TD} text-muted-foreground`}>{c.company_name ?? <Dash />}</td>
                      <td className={TD}>{c.project_role}</td>
                      <td className={`${TD} max-w-56 truncate`}>
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="text-muted-foreground hover:text-foreground">
                            {c.email}
                          </a>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {c.primary_phone ? (
                          <a href={`tel:${c.primary_phone}`} className="text-muted-foreground hover:text-foreground">
                            {formatPhone(c.primary_phone)}
                          </a>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>
                        {c.secondary_phone ? (
                          <a href={`tel:${c.secondary_phone}`} className="text-muted-foreground hover:text-foreground">
                            {formatPhone(c.secondary_phone)}
                          </a>
                        ) : (
                          <Dash />
                        )}
                      </td>
                      <td className={TD}>
                        <div className="flex flex-col items-start gap-0.5">
                          <StatusPill contact={c} />
                          <span className="text-[11px] text-muted-foreground">
                            {c.status === 'active' ? `Since ${formatDate(c.started_at)}` : `Ended ${c.ended_at ? formatDate(c.ended_at) : ''}`}
                          </span>
                        </div>
                      </td>
                      <td className={TD}>{actions(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="flex flex-col gap-2 md:hidden">
              {visible.map((c) => (
                <li key={c.association_id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/contacts/people/${c.person_id}`} className="block truncate text-sm font-medium hover:text-primary">
                        {c.name}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{c.project_role}</span>
                        {c.company_name ? ` · ${c.company_name}` : ''}
                      </p>
                    </div>
                    <StatusPill contact={c} />
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="truncate hover:text-foreground">
                        {c.email}
                      </a>
                    )}
                    {(c.primary_phone || c.secondary_phone) && (
                      <span>
                        {[c.primary_phone, c.secondary_phone].filter(Boolean).map((p) => formatPhone(p as string)).join(' · ')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{c.status === 'active' ? `Since ${formatDate(c.started_at)}` : `Ended ${c.ended_at ? formatDate(c.ended_at) : ''}`}</span>
                    {actions(c)}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {companies.length > 0 && (
        <section aria-labelledby="pc-companies-heading" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
          <div>
            <h2 id="pc-companies-heading" className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
              Assigned subcontractor companies
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Assigning a company does not add its people. Assign the individuals who actually work this job.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {companies.map((co) => (
              <li key={co.subcontractor_company_id} className="rounded-lg border border-border p-3">
                {co.directory_company_id ? (
                  <Link href={`/contacts/companies/${co.directory_company_id}`} className="text-sm font-medium hover:text-primary hover:underline">
                    {co.company_name}
                  </Link>
                ) : (
                  <span className="text-sm font-medium">{co.company_name}</span>
                )}
                {co.people.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No directory contacts linked to this company.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {co.people.map((p) => (
                      <li key={p.relationship_id} className="flex items-center justify-between gap-2 text-xs">
                        <Link href={`/contacts/people/${p.person_id}`} className="min-w-0 truncate hover:text-primary">
                          {p.name}
                          {p.role ? <span className="text-muted-foreground">{` · ${p.role}`}</span> : null}
                        </Link>
                        {activePersonIds.has(p.person_id) ? (
                          <span className="shrink-0 text-muted-foreground">On project</span>
                        ) : p.person_status === 'inactive' ? (
                          <span className="shrink-0 text-muted-foreground">Inactive</span>
                        ) : canAssign ? (
                          <button
                            type="button"
                            onClick={() =>
                              setDialog({ mode: 'existing', prefill: { personId: p.person_id, relationshipId: p.relationship_id, role: p.role ?? '' } })
                            }
                            className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                          >
                            <UserPlus className="size-3" aria-hidden="true" />
                            Assign
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog && (
        <AssignDialog
          key={`${dialog.mode}-${dialog.prefill?.personId ?? 'new'}`}
          projectId={projectId}
          assignable={assignable}
          excluded={activePersonIds}
          prefill={dialog.prefill}
          initialMode={dialog.mode}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
