'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Mail, Phone, Plus, Search, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect, TextField } from '@/components/shared/form-field'
import { ProjectRoleField, StartDateField } from '@/components/contacts/project-role-field'
import { formatPhone } from '@/lib/format'
import type { ActionState } from '@/lib/action-state'
import type { AssignablePerson, ProjectCompanyContacts, ProjectContact } from '@/lib/project-contacts-data'
import { assignProjectContactAction, endPersonProjectAction } from '@/app/actions/contacts'

export type Prefill = { personId: string; relationshipId: string; role: string } | null

export function ProjectContactsPanel({
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
  const [dialog, setDialog] = useState<{ prefill: Prefill } | null>(null)
  const [endingId, setEndingId] = useState<string | null>(null)
  const [, startEnd] = useTransition()

  const roles = useMemo(() => [...new Set(contacts.map((c) => c.project_role))].sort(), [contacts])
  const activeCount = contacts.filter((c) => c.status === 'active').length
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return contacts.filter(
      (c) =>
        (showHistory ? c.status === 'ended' : c.status === 'active') &&
        (!roleFilter || c.project_role === roleFilter) &&
        (!q || [c.name, c.company_name, c.email, c.project_role, c.primary_phone].some((v) => v?.toLowerCase().includes(q))),
    )
  }, [contacts, query, roleFilter, showHistory])
  const activePersonIds = new Set(contacts.filter((c) => c.status === 'active').map((c) => c.person_id))

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

  return (
    <section aria-labelledby="project-contacts-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="project-contacts-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="size-4 text-muted-foreground" aria-hidden="true" />
            Project contacts
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activeCount} active {activeCount === 1 ? 'contact' : 'contacts'} from the directory
            {' · '}
            <Link href={`/projects/${encodeURIComponent(projectId)}/contacts`} className="font-medium text-primary underline-offset-4 hover:underline">
              Open table
            </Link>
          </p>
        </div>
        {canEdit && acceptsAssignments && (
          <Button size="sm" variant="outline" onClick={() => setDialog({ prefill: null })}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="project-contacts-search" className="sr-only">
            Search project contacts
          </label>
          <Input
            id="project-contacts-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts"
            className="h-9 pl-8"
          />
        </div>
        <div className="flex gap-2">
          <label htmlFor="project-contacts-role" className="sr-only">
            Filter by project role
          </label>
          <NativeSelect id="project-contacts-role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="h-9 flex-1">
            <option value="">All roles</option>
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </NativeSelect>
          <div role="group" aria-label="Association status" className="inline-flex rounded-lg border border-border p-0.5">
            {[
              { v: false, l: 'Current' },
              { v: true, l: 'Past' },
            ].map((o) => (
              <button
                key={o.l}
                type="button"
                aria-pressed={showHistory === o.v}
                onClick={() => setShowHistory(o.v)}
                className={
                  showHistory === o.v
                    ? 'rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground'
                    : 'rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground'
                }
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs leading-relaxed text-muted-foreground">
          {contacts.length === 0
            ? 'No directory contacts are assigned to this project yet.'
            : showHistory
              ? 'No past associations match.'
              : 'No current contacts match.'}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {visible.map((c) => (
            <li key={c.association_id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/contacts/people/${c.person_id}`}
                    className="block truncate text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {c.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{c.project_role}</span>
                    {c.company_name ? ` · ${c.company_name}` : ''}
                  </p>
                </div>
                {c.person_status === 'inactive' && (
                  <span className="shrink-0 rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground">
                    <Mail className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{c.email}</span>
                  </a>
                )}
                {c.primary_phone && (
                  <a href={`tel:${c.primary_phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                    <Phone className="size-3" aria-hidden="true" />
                    {formatPhone(c.primary_phone)}
                  </a>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  {c.status === 'active' ? `Since ${c.started_at}` : `${c.started_at} to ${c.ended_at ?? 'unknown'}`}
                </span>
                {canEdit && c.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => end(c.association_id, c.name)}
                    disabled={endingId === c.association_id}
                    className="font-medium text-muted-foreground underline-offset-4 hover:text-destructive hover:underline disabled:opacity-50"
                  >
                    {endingId === c.association_id ? 'Ending...' : 'End association'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {companies.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Building2 className="size-3.5" aria-hidden="true" />
            Assigned companies
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Company assignment does not add its people. Assign the contacts who actually work this job.
          </p>
          <ul className="flex flex-col gap-2">
            {companies.map((co) => (
              <li key={co.subcontractor_company_id} className="rounded-lg border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  {co.directory_company_id ? (
                    <Link href={`/contacts/companies/${co.directory_company_id}`} className="truncate text-sm font-medium hover:text-primary hover:underline">
                      {co.company_name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-medium">{co.company_name}</span>
                  )}
                </div>
                {co.people.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No directory contacts linked to this company.</p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1">
                    {co.people.map((p) => {
                      const assigned = activePersonIds.has(p.person_id)
                      return (
                        <li key={p.relationship_id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="min-w-0 truncate">
                            {p.name}
                            {p.role ? <span className="text-muted-foreground">{` · ${p.role}`}</span> : null}
                          </span>
                          {assigned ? (
                            <span className="shrink-0 text-muted-foreground">On project</span>
                          ) : canEdit && acceptsAssignments && p.person_status === 'active' ? (
                            <button
                              type="button"
                              onClick={() => setDialog({ prefill: { personId: p.person_id, relationshipId: p.relationship_id, role: p.role ?? '' } })}
                              className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                            >
                              <UserPlus className="size-3" aria-hidden="true" />
                              Assign
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialog && (
        <AssignDialog
          key={dialog.prefill?.personId ?? 'new'}
          projectId={projectId}
          assignable={assignable}
          excluded={activePersonIds}
          prefill={dialog.prefill}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null)
            router.refresh()
          }}
        />
      )}
    </section>
  )
}

export function AssignDialog({
  projectId,
  assignable,
  excluded,
  prefill,
  initialMode = 'existing',
  onClose,
  onDone,
}: {
  projectId: string
  assignable: AssignablePerson[]
  excluded: Set<string>
  prefill: Prefill
  initialMode?: 'existing' | 'new'
  onClose: () => void
  onDone: () => void
}) {
  const [mode, setMode] = useState<'existing' | 'new'>(prefill ? 'existing' : initialMode)
  const [personId, setPersonId] = useState(prefill?.personId ?? '')
  const [state, action, pending] = useActionState<ActionState, FormData>(assignProjectContactAction.bind(null, projectId), {})
  const options = useMemo(() => assignable.filter((p) => !excluded.has(p.id) || p.id === prefill?.personId), [assignable, excluded, prefill])
  const selected = assignable.find((p) => p.id === personId)
  const fe = state.fieldErrors ?? {}

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
      onDone()
    }
  }, [state, onDone])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add project contact</DialogTitle>
          <DialogDescription>Assign a person from the business directory, or create a new contact for this project.</DialogDescription>
        </DialogHeader>
        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="mode" value={mode} />
          {!prefill && (
            <div role="radiogroup" aria-label="Contact source" className="grid grid-cols-2 rounded-lg border border-border p-1">
              {(['existing', 'new'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={
                    mode === m
                      ? 'rounded-md bg-primary py-1.5 text-sm font-medium text-primary-foreground'
                      : 'rounded-md py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground'
                  }
                >
                  {m === 'existing' ? 'Existing contact' : 'New contact'}
                </button>
              ))}
            </div>
          )}

          {mode === 'existing' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="assign-person" className="text-sm font-medium">
                  Contact <span className="text-destructive">*</span>
                </label>
                <NativeSelect
                  id="assign-person"
                  name="person_id"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  required
                  aria-invalid={fe.person_id ? true : undefined}
                >
                  <option value="" disabled>
                    Choose an active contact
                  </option>
                  {options.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </NativeSelect>
                {fe.person_id && <p className="text-xs text-destructive">{fe.person_id}</p>}
              </div>
              {selected && selected.companies.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="assign-via" className="text-sm font-medium">
                    On behalf of
                  </label>
                  <NativeSelect id="assign-via" name="person_company_id" defaultValue={prefill?.relationshipId ?? ''} key={selected.id}>
                    <option value="">No company</option>
                    {selected.companies.map((c) => (
                      <option key={c.relationship_id} value={c.relationship_id}>
                        {c.company_name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="first_name" label="First name" required defaultValue={state.values?.first_name} error={fe.first_name} />
              <TextField name="last_name" label="Last name" required defaultValue={state.values?.last_name} error={fe.last_name} />
              <TextField name="email" label="Email" type="email" defaultValue={state.values?.email} error={fe.email} className="sm:col-span-2" />
              <TextField name="primary_phone" label="Phone" type="tel" defaultValue={state.values?.primary_phone} error={fe.primary_phone} className="sm:col-span-2" />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <ProjectRoleField key={prefill?.personId ?? 'role'} defaultValue={state.values?.project_role ?? prefill?.role ?? ''} error={fe.project_role} />
            <StartDateField defaultValue={state.values?.started_at} error={fe.started_at} />
          </div>

          {state.error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving...' : mode === 'new' ? 'Create and assign' : 'Assign to project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
