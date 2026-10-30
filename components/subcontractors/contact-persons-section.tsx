'use client'

import { useId, useMemo, useState } from 'react'
import {
  AlertCircle as AlertCircleIcon,
  Search as SearchIcon,
  Star as StarIcon,
  Undo2 as UndoIcon,
  UserPlus as UserPlusIcon,
  Users as UsersIcon,
  X as XIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/shared/form-field'
import { SUBCONTRACTOR_CONTACT_ROLES } from '@/lib/contacts'
import {
  CONTACT_PERSONS_FIELD,
  MAX_CONTACT_PERSONS,
  contactFieldKey,
  findPossibleExistingPeople,
  matchesContactSearch,
  type ContactPersonDraft,
  type ContactPersonOption,
  type CurrentContactPerson,
} from '@/lib/subcontractor-contact-persons'
import type { ContactsAvailability } from '@/lib/subcontractor-form-data'
import { cn } from '@/lib/utils'

const newKey = () => `c-${Math.random().toString(36).slice(2, 10)}`

function initialDrafts(saved: string | undefined, current: CurrentContactPerson[]): ContactPersonDraft[] {
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) return parsed as ContactPersonDraft[]
    } catch {
      // Fall back to the saved relationships below.
    }
  }
  return current.map((c) => ({
    key: c.relationship_id.slice(0, 8),
    kind: 'current',
    relationship_id: c.relationship_id,
    person_id: c.person.id,
    role: c.role ?? '',
    is_primary: c.is_primary,
    remove: false,
  }))
}

const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`.trim()

function personDetail(p: ContactPersonOption) {
  return [p.email, p.primary_phone].filter(Boolean).join(' · ')
}

export function ContactPersonsSection({
  people,
  currentContacts = [],
  availability,
  savedValue,
  errors,
}: {
  people: ContactPersonOption[]
  currentContacts?: CurrentContactPerson[]
  availability: ContactsAvailability
  savedValue?: string
  errors: Record<string, string | undefined>
}) {
  const [drafts, setDrafts] = useState<ContactPersonDraft[]>(() => initialDrafts(savedValue, currentContacts))
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const searchId = useId()

  const peopleById = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]))
    for (const c of currentContacts) map.set(c.person.id, c.person)
    return map
  }, [people, currentContacts])

  if (availability !== 'ready') {
    return (
      <p className="col-span-full flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {availability === 'setup-required'
          ? 'Contact persons will be available once the Contacts directory is set up for your company.'
          : 'Contact persons could not be loaded. You can still save the company and add people later.'}
      </p>
    )
  }

  const listedIds = new Set(
    drafts.flatMap((d) => (d.kind === 'new' || (d.kind === 'current' && d.remove) ? [] : [d.person_id])),
  )
  const results = searching
    ? people.filter((p) => !listedIds.has(p.id) && matchesContactSearch(p, query)).slice(0, 8)
    : []
  const atLimit = drafts.length >= MAX_CONTACT_PERSONS

  const update = (key: string, patch: Partial<ContactPersonDraft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? ({ ...d, ...patch } as ContactPersonDraft) : d)))
  const setPrimary = (key: string, value: boolean) =>
    setDrafts((list) =>
      list.map((d) => ({ ...d, is_primary: d.key === key ? value : value ? false : d.is_primary }) as ContactPersonDraft),
    )
  const removeDraft = (key: string) => setDrafts((list) => list.filter((d) => d.key !== key))
  const addExisting = (person: ContactPersonOption) => {
    setDrafts((list) => [...list, { key: newKey(), kind: 'existing', person_id: person.id, role: '', is_primary: false }])
    setSearching(false)
    setQuery('')
  }
  const addNew = () =>
    setDrafts((list) => [
      ...list,
      { key: newKey(), kind: 'new', role: '', is_primary: false, first_name: '', last_name: '', email: '', primary_phone: '', secondary_phone: '' },
    ])
  const swapToExisting = (key: string, person: ContactPersonOption) =>
    setDrafts((list) =>
      list.map((d) =>
        d.key === key ? { key: d.key, kind: 'existing', person_id: person.id, role: d.role, is_primary: d.is_primary } : d,
      ),
    )

  const sectionError = errors[CONTACT_PERSONS_FIELD]

  return (
    <div className="col-span-full flex flex-col gap-4">
      <input type="hidden" name={CONTACT_PERSONS_FIELD} value={JSON.stringify(drafts)} />

      {sectionError && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {sectionError}
        </p>
      )}

      {drafts.length === 0 && !searching && (
        <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <UsersIcon className="size-5 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">No contact persons yet</p>
          <p className="text-sm text-muted-foreground">Add the people your team calls at this company, such as the foreman or office contact.</p>
        </div>
      )}

      {drafts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {drafts.map((d) => {
            const err = (field: string) => errors[contactFieldKey(d.key, field)]
            const person = d.kind === 'new' ? null : peopleById.get(d.person_id)
            const removed = d.kind === 'current' && d.remove
            const matches = d.kind === 'new' ? findPossibleExistingPeople(d, people.filter((p) => !listedIds.has(p.id))) : []
            return (
              <li
                key={d.key}
                className={cn(
                  'flex flex-col gap-4 rounded-lg border border-border bg-background p-4',
                  removed && 'border-dashed bg-muted/40',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <p className={cn('truncate text-sm font-semibold text-foreground', removed && 'text-muted-foreground line-through')}>
                      {d.kind === 'new' ? fullName(d) || 'New contact' : person ? fullName(person) : 'Unknown contact'}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.kind === 'new'
                        ? 'Will be added to your Contacts directory'
                        : removed
                          ? 'Will be removed from this company. The person stays in Contacts.'
                          : person
                            ? personDetail(person) || 'No email or phone on file'
                            : ''}
                    </p>
                    {err('person_id') && <p className="text-xs text-destructive">{err('person_id')}</p>}
                  </div>
                  {d.kind === 'current' ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => update(d.key, { remove: !removed, is_primary: false })}>
                      {removed ? <UndoIcon aria-hidden="true" /> : <XIcon aria-hidden="true" />}
                      {removed ? 'Keep' : 'Remove'}
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove this contact person" onClick={() => removeDraft(d.key)}>
                      <XIcon aria-hidden="true" />
                    </Button>
                  )}
                </div>

                {d.kind === 'new' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InlineField id={`${d.key}-first`} label="First name" required error={err('first_name')}>
                      <Input id={`${d.key}-first`} value={d.first_name} maxLength={80} autoComplete="off" aria-invalid={Boolean(err('first_name'))} onChange={(e) => update(d.key, { first_name: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-last`} label="Last name" required error={err('last_name')}>
                      <Input id={`${d.key}-last`} value={d.last_name} maxLength={80} autoComplete="off" aria-invalid={Boolean(err('last_name'))} onChange={(e) => update(d.key, { last_name: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-email`} label="Email" error={err('email')}>
                      <Input id={`${d.key}-email`} type="email" value={d.email} maxLength={254} autoComplete="off" aria-invalid={Boolean(err('email'))} onChange={(e) => update(d.key, { email: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-phone`} label="Phone" error={err('primary_phone')}>
                      <Input id={`${d.key}-phone`} type="tel" value={d.primary_phone} maxLength={30} autoComplete="off" aria-invalid={Boolean(err('primary_phone'))} onChange={(e) => update(d.key, { primary_phone: e.target.value })} />
                    </InlineField>
                    {matches.length > 0 && (
                      <div className="col-span-full flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
                        <p className="text-xs font-medium text-foreground">This may already be in your Contacts directory:</p>
                        <ul className="flex flex-col gap-1.5">
                          {matches.slice(0, 3).map((m) => (
                            <li key={m.id} className="flex items-center justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{fullName(m)}</span>
                                <span className="text-muted-foreground"> {personDetail(m) && `· ${personDetail(m)}`}</span>
                              </span>
                              <Button type="button" variant="outline" size="sm" onClick={() => swapToExisting(d.key, m)}>
                                Use this contact
                              </Button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {!removed && (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <InlineField id={`${d.key}-role`} label="Role at this company" error={err('role')} className="sm:w-64">
                      <NativeSelect id={`${d.key}-role`} value={d.role} onChange={(e) => update(d.key, { role: e.target.value })}>
                        <option value="">No role</option>
                        {SUBCONTRACTOR_CONTACT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {d.role && !(SUBCONTRACTOR_CONTACT_ROLES as readonly string[]).includes(d.role) && <option value={d.role}>{d.role}</option>}
                      </NativeSelect>
                    </InlineField>
                    <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={d.is_primary}
                        onChange={(e) => setPrimary(d.key, e.target.checked)}
                      />
                      <StarIcon className={cn('size-3.5', d.is_primary ? 'fill-primary text-primary' : 'text-muted-foreground')} aria-hidden="true" />
                      Primary contact
                    </label>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {searching && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3">
          <Label htmlFor={searchId} className="text-sm font-medium">
            Find a person in Contacts
          </Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id={searchId}
              autoFocus
              value={query}
              placeholder="Search by name, email, or phone"
              className="h-10 pl-9"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault()
                if (e.key === 'Escape') setSearching(false)
              }}
            />
          </div>
          {results.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border" aria-label="Matching contacts">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    onClick={() => addExisting(p)}
                  >
                    <span className="text-sm font-medium text-foreground">{fullName(p)}</span>
                    <span className="text-xs text-muted-foreground">
                      {[personDetail(p), p.companies.map((c) => (c.role ? `${c.role}, ${c.name}` : c.name)).join('; ')]
                        .filter(Boolean)
                        .join(' · ') || 'No other details'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              {people.length === 0 ? 'Your Contacts directory has no people yet.' : 'No matching people.'}{' '}
              <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setSearching(false); addNew() }}>
                Add a new contact instead
              </button>
            </p>
          )}
          <div className="flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSearching(false); setQuery('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={atLimit || searching} onClick={() => setSearching(true)}>
          <SearchIcon aria-hidden="true" />
          Add existing contact
        </Button>
        <Button type="button" variant="outline" disabled={atLimit} onClick={addNew}>
          <UserPlusIcon aria-hidden="true" />
          Add new contact
        </Button>
      </div>
      {atLimit && <p className="text-xs text-muted-foreground">{`You can list up to ${MAX_CONTACT_PERSONS} contact persons.`}</p>}
    </div>
  )
}

function InlineField({
  id,
  label,
  required,
  error,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
