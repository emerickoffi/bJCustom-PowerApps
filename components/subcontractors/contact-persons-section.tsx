'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  AlertCircle as AlertCircleIcon,
  Mail as MailIcon,
  Phone as PhoneIcon,
  Plus as PlusIcon,
  RefreshCw as ChangeIcon,
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
const initials = (p: { first_name: string; last_name: string }) =>
  `${p.first_name.trim().charAt(0)}${p.last_name.trim().charAt(0)}`.toUpperCase() || '?'

function personDetail(p: ContactPersonOption) {
  return [p.email, p.primary_phone].filter(Boolean).join(' · ')
}

/** Splits a typed search like "Jane Doe" into a starting first/last name for a new contact. */
function nameFromQuery(query: string) {
  const q = query.trim()
  if (!q || /[@\d]/.test(q)) return { first_name: '', last_name: '' }
  const [first, ...rest] = q.split(/\s+/)
  return { first_name: first.slice(0, 80), last_name: rest.join(' ').slice(0, 80) }
}

type Picker = { mode: 'add' } | { mode: 'change'; key: string }

export function ContactPersonsSection({
  people,
  currentContacts = [],
  availability,
  savedValue,
  errors,
  onDirty,
}: {
  people: ContactPersonOption[]
  currentContacts?: CurrentContactPerson[]
  availability: ContactsAvailability
  savedValue?: string
  errors: Record<string, string | undefined>
  /** Called on every programmatic change, since card edits do not all fire native form events. */
  onDirty?: () => void
}) {
  const [drafts, setDraftsState] = useState<ContactPersonDraft[]>(() => initialDrafts(savedValue, currentContacts))
  const [picker, setPicker] = useState<Picker | null>(null)
  const [query, setQuery] = useState('')
  const searchId = useId()
  const addButtonRef = useRef<HTMLButtonElement>(null)

  const setDrafts = (next: (list: ContactPersonDraft[]) => ContactPersonDraft[]) => {
    onDirty?.()
    setDraftsState(next)
  }

  const peopleById = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]))
    for (const c of currentContacts) map.set(c.person.id, c.person)
    return map
  }, [people, currentContacts])

  if (availability !== 'ready') {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
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
  const results = picker ? people.filter((p) => !listedIds.has(p.id) && matchesContactSearch(p, query)).slice(0, 8) : []
  const atLimit = drafts.length >= MAX_CONTACT_PERSONS
  const hasPrimary = drafts.some((d) => d.is_primary && !(d.kind === 'current' && d.remove))

  const closePicker = () => {
    setPicker(null)
    setQuery('')
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }
  const update = (key: string, patch: Partial<ContactPersonDraft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? ({ ...d, ...patch } as ContactPersonDraft) : d)))
  const setPrimary = (key: string, value: boolean) =>
    setDrafts((list) =>
      list.map((d) => ({ ...d, is_primary: d.key === key ? value : value ? false : d.is_primary }) as ContactPersonDraft),
    )
  const removeDraft = (key: string) => setDrafts((list) => list.filter((d) => d.key !== key))
  const choosePerson = (person: ContactPersonOption) => {
    if (picker?.mode === 'change') {
      const key = picker.key
      setDrafts((list) =>
        list.map((d) => (d.key === key ? { key, kind: 'existing', person_id: person.id, role: d.role, is_primary: d.is_primary } : d)),
      )
    } else {
      // The first person added becomes the primary contact, which is what most teams want; it can be changed.
      setDrafts((list) => [...list, { key: newKey(), kind: 'existing', person_id: person.id, role: '', is_primary: !hasPrimary }])
    }
    closePicker()
  }
  const createNew = () => {
    const name = nameFromQuery(query)
    const blank = { role: '', email: '', primary_phone: '', secondary_phone: '', ...name }
    if (picker?.mode === 'change') {
      const key = picker.key
      setDrafts((list) => list.map((d) => (d.key === key ? { key, kind: 'new', is_primary: d.is_primary, ...blank, role: d.role } : d)))
    } else {
      setDrafts((list) => [...list, { key: newKey(), kind: 'new', is_primary: !hasPrimary, ...blank }])
    }
    setPicker(null)
    setQuery('')
  }
  const swapToExisting = (key: string, person: ContactPersonOption) =>
    setDrafts((list) =>
      list.map((d) =>
        d.key === key ? { key: d.key, kind: 'existing', person_id: person.id, role: d.role, is_primary: d.is_primary } : d,
      ),
    )

  const sectionError = errors[CONTACT_PERSONS_FIELD]

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={CONTACT_PERSONS_FIELD} value={JSON.stringify(drafts)} />

      {sectionError && (
        <p role="alert" className="flex items-start gap-1.5 text-sm text-destructive">
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {sectionError}
        </p>
      )}

      {drafts.length === 0 && !picker && (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3.5">
          <UsersIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            No people yet. Add the owner, foreman, or office contact so your team knows who to call.
          </p>
        </div>
      )}

      {drafts.length > 0 && (
        <ul className="flex flex-col gap-2.5" aria-label="Contact persons">
          {drafts.map((d) => {
            const err = (field: string) => errors[contactFieldKey(d.key, field)]
            const person = d.kind === 'new' ? null : peopleById.get(d.person_id)
            const removed = d.kind === 'current' && d.remove
            const matches = d.kind === 'new' ? findPossibleExistingPeople(d, people.filter((p) => !listedIds.has(p.id))) : []
            const display = d.kind === 'new' ? d : person
            const name = display ? fullName(display) : ''
            const otherCompanies = person?.companies ?? []
            const changing = picker?.mode === 'change' && picker.key === d.key
            return (
              <li
                key={d.key}
                className={cn(
                  'flex flex-col gap-3 rounded-lg border bg-background p-3.5',
                  d.is_primary && !removed ? 'border-primary/40 ring-1 ring-inset ring-primary/10' : 'border-border',
                  removed && 'border-dashed bg-muted/40',
                  changing && 'ring-2 ring-ring/40',
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      removed ? 'bg-muted text-muted-foreground' : 'bg-sage text-primary',
                    )}
                  >
                    {display ? initials(display) : <UserPlusIcon className="size-4" />}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <p className={cn('truncate text-sm font-semibold text-foreground', removed && 'text-muted-foreground line-through')}>
                        {name || 'New contact'}
                      </p>
                      {d.role && !removed && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{d.role}</span>
                      )}
                      {d.is_primary && !removed && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                          <StarIcon className="size-3 fill-current" aria-hidden="true" />
                          Primary
                        </span>
                      )}
                    </div>
                    {d.kind === 'new' ? (
                      <p className="text-xs text-muted-foreground">New person. Will be added to your Contacts directory.</p>
                    ) : removed ? (
                      <p className="text-xs text-muted-foreground">Will be removed from this company. The person and their history stay in Contacts.</p>
                    ) : person ? (
                      <ContactDetails person={person} />
                    ) : null}
                    {d.kind !== 'new' && !removed && otherCompanies.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {'Also with '}
                        {otherCompanies.map((c) => (c.role ? `${c.name} (${c.role})` : c.name)).join(', ')}
                      </p>
                    )}
                    {err('person_id') && <p className="text-xs text-destructive">{err('person_id')}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {d.kind === 'current' ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => update(d.key, { remove: !removed, is_primary: false })}>
                        {removed ? <UndoIcon aria-hidden="true" /> : <XIcon aria-hidden="true" />}
                        {removed ? 'Keep' : 'Remove'}
                      </Button>
                    ) : (
                      <>
                        {d.kind === 'existing' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Change ${name || 'this contact'}`}
                            onClick={() => {
                              setQuery('')
                              setPicker({ mode: 'change', key: d.key })
                            }}
                          >
                            <ChangeIcon aria-hidden="true" />
                            <span className="hidden sm:inline">Change</span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${name || 'this contact'}`}
                          onClick={() => removeDraft(d.key)}
                        >
                          <XIcon aria-hidden="true" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {d.kind === 'new' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InlineField id={`${d.key}-first`} label="First name" required error={err('first_name')}>
                      <Input id={`${d.key}-first`} value={d.first_name} maxLength={80} autoComplete="off" autoFocus={!d.first_name} aria-invalid={Boolean(err('first_name'))} onChange={(e) => update(d.key, { first_name: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-last`} label="Last name" required error={err('last_name')}>
                      <Input id={`${d.key}-last`} value={d.last_name} maxLength={80} autoComplete="off" aria-invalid={Boolean(err('last_name'))} onChange={(e) => update(d.key, { last_name: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-email`} label="Email" optional error={err('email')} className="sm:col-span-2">
                      <Input id={`${d.key}-email`} type="email" inputMode="email" value={d.email} maxLength={254} autoComplete="off" aria-invalid={Boolean(err('email'))} onChange={(e) => update(d.key, { email: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-phone`} label="Primary phone" optional error={err('primary_phone')}>
                      <Input id={`${d.key}-phone`} type="tel" inputMode="tel" value={d.primary_phone} maxLength={30} autoComplete="off" aria-invalid={Boolean(err('primary_phone'))} onChange={(e) => update(d.key, { primary_phone: e.target.value })} />
                    </InlineField>
                    <InlineField id={`${d.key}-phone2`} label="Secondary phone" optional error={err('secondary_phone')}>
                      <Input id={`${d.key}-phone2`} type="tel" inputMode="tel" value={d.secondary_phone} maxLength={30} autoComplete="off" aria-invalid={Boolean(err('secondary_phone'))} onChange={(e) => update(d.key, { secondary_phone: e.target.value })} />
                    </InlineField>
                    {matches.length > 0 && (
                      <div className="col-span-full flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-3" role="status">
                        <p className="text-xs font-medium text-foreground">This person may already be in your Contacts directory:</p>
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
                  <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`${d.key}-role`} className="shrink-0 text-xs font-medium text-muted-foreground">
                        Company role
                      </Label>
                      <NativeSelect
                        id={`${d.key}-role`}
                        value={d.role}
                        className="h-8 w-full sm:w-44"
                        aria-invalid={Boolean(err('role'))}
                        onChange={(e) => update(d.key, { role: e.target.value })}
                      >
                        <option value="">No role</option>
                        {SUBCONTRACTOR_CONTACT_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                        {d.role && !(SUBCONTRACTOR_CONTACT_ROLES as readonly string[]).includes(d.role) && <option value={d.role}>{d.role}</option>}
                      </NativeSelect>
                    </div>
                    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={d.is_primary}
                        onChange={(e) => setPrimary(d.key, e.target.checked)}
                      />
                      Primary contact
                    </label>
                  </div>
                )}
                {err('role') && <p className="text-xs text-destructive">{err('role')}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {picker && (
        <PersonPicker
          id={searchId}
          title={picker.mode === 'change' ? 'Choose a different person' : 'Add a person'}
          query={query}
          onQuery={setQuery}
          results={results}
          emptyDirectory={people.length === 0}
          onChoose={choosePerson}
          onCreate={createNew}
          onCancel={closePicker}
        />
      )}

      {!picker && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button ref={addButtonRef} type="button" variant="outline" disabled={atLimit} onClick={() => setPicker({ mode: 'add' })}>
            <PlusIcon aria-hidden="true" />
            Add person
          </Button>
          {atLimit ? (
            <p className="text-xs text-muted-foreground">{`You can list up to ${MAX_CONTACT_PERSONS} contact persons.`}</p>
          ) : drafts.length > 0 && !hasPrimary ? (
            <p className="text-xs text-muted-foreground">Tip: mark one person as the primary contact.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function ContactDetails({ person }: { person: ContactPersonOption }) {
  const items = [
    person.email && { icon: MailIcon, value: person.email, label: 'Email' },
    person.primary_phone && { icon: PhoneIcon, value: person.primary_phone, label: 'Primary phone' },
    person.secondary_phone && { icon: PhoneIcon, value: person.secondary_phone, label: 'Secondary phone' },
  ].filter(Boolean) as { icon: typeof MailIcon; value: string; label: string }[]
  if (!items.length) return <p className="text-xs text-muted-foreground">No email or phone on file</p>
  return (
    <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {items.map(({ icon: Icon, value, label }) => (
        <span key={label} className="inline-flex min-w-0 items-center gap-1">
          <Icon className="size-3 shrink-0" aria-hidden="true" />
          <span className="sr-only">{label}:</span>
          <span className="truncate">{value}</span>
        </span>
      ))}
    </p>
  )
}

function PersonPicker({
  id,
  title,
  query,
  onQuery,
  results,
  emptyDirectory,
  onChoose,
  onCreate,
  onCancel,
}: {
  id: string
  title: string
  query: string
  onQuery: (q: string) => void
  results: ContactPersonOption[]
  emptyDirectory: boolean
  onChoose: (p: ContactPersonOption) => void
  onCreate: () => void
  onCancel: () => void
}) {
  const [active, setActive] = useState(0)
  const listId = `${id}-list`
  const options = results.length + 1
  const activeIndex = Math.min(active, options - 1)

  useEffect(() => setActive(0), [query])

  const select = (index: number) => (index < results.length ? onChoose(results[index]) : onCreate())

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {title}
        </Label>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={id}
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={`${listId}-${activeIndex}`}
          value={query}
          placeholder="Search Contacts by name, email, or phone"
          autoComplete="off"
          className="h-10 bg-background pl-9"
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((i) => Math.min(i + 1, options - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              select(activeIndex)
            } else if (e.key === 'Escape') {
              // Keep Escape inside the picker so it does not also close the drawer.
              e.preventDefault()
              e.stopPropagation()
              onCancel()
            }
          }}
        />
      </div>
      <ul id={listId} role="listbox" aria-label="Matching people" className="flex max-h-72 flex-col overflow-y-auto rounded-md border border-border bg-background">
        {results.map((p, i) => (
          <li
            key={p.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === activeIndex}
            className={cn('flex cursor-pointer flex-col gap-0.5 border-b border-border/60 px-3 py-2', i === activeIndex && 'bg-muted')}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChoose(p)}
          >
            <span className="text-sm font-medium text-foreground">{fullName(p)}</span>
            <span className="text-xs text-muted-foreground">
              {[personDetail(p), p.companies.map((c) => (c.role ? `${c.role}, ${c.name}` : c.name)).join('; ')]
                .filter(Boolean)
                .join(' · ') || 'No other details'}
            </span>
          </li>
        ))}
        {results.length === 0 && (
          <li role="presentation" className="border-b border-border/60 px-3 py-2 text-sm text-muted-foreground">
            {emptyDirectory ? 'Your Contacts directory has no people yet.' : 'No matching people in Contacts.'}
          </li>
        )}
        <li
          id={`${listId}-${results.length}`}
          role="option"
          aria-selected={activeIndex === results.length}
          className={cn(
            'flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-medium text-primary',
            activeIndex === results.length && 'bg-muted',
          )}
          onMouseEnter={() => setActive(results.length)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCreate}
        >
          <UserPlusIcon className="size-4" aria-hidden="true" />
          {query.trim() && nameFromQuery(query).first_name ? `Create new contact "${query.trim()}"` : 'Create new contact'}
        </li>
      </ul>
    </div>
  )
}

function InlineField({
  id,
  label,
  required,
  optional,
  error,
  className,
  children,
}: {
  id: string
  label: string
  required?: boolean
  optional?: boolean
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={id} className="text-xs font-medium text-foreground">
        {label}
        {required && (
          <>
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
        {optional && <span className="font-normal text-muted-foreground">Optional</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
