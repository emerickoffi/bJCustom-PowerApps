'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Info, Mail, MoreHorizontal, Pencil, Phone, Plus, Star, UserRound, UserRoundMinus, Users, UsersRound } from 'lucide-react'
import { CardSectionHeader } from '@/components/shared/card-section-header'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { formatDate, formatPhone } from '@/lib/format'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import {
  addCompanyContactAction,
  endRelationshipAction,
  setPrimaryContactAction,
  updateCompanyContactAction,
} from '@/app/actions/contacts'
import { SUBCONTRACTOR_CONTACT_ROLES } from '@/lib/contacts'
import type { CompanyContact } from '@/lib/contacts-data'

type Target = { companyId: string } | { subcontractorId: string }

const ROLE_LIST_ID = 'contact-role-options'

function isValidEmail(email: string | null): email is string {
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

function telHref(phone: string | null): string | null {
  const digits = phone?.replace(/[^0-9+]/g, '') ?? ''
  return digits.replace(/\D/g, '').length >= 7 ? `tel:${digits}` : null
}

/**
 * Lists a company's contact persons with current and past relationships, and lets managers add a new or existing
 * person, edit a contact in place, set the primary contact, or end an association. Used on company profiles and
 * Subcontractor pages. `variant="section"` renders without its own card so it can sit inside a combined card.
 */
export function CompanyContacts({
  target,
  contacts,
  people,
  canEdit,
  companyInactive,
  subcontractor,
  heading = 'Contact persons',
  previewLimit,
  variant = 'card',
  className,
}: {
  target: Target
  contacts: CompanyContact[]
  people: { id: string; label: string }[]
  canEdit: boolean
  companyInactive?: boolean
  /** Uses the subcontractor role presets. */
  subcontractor?: boolean
  heading?: string
  /** Shows the primary contact first plus this many people in total, with a "View all" toggle for the rest. */
  previewLimit?: number
  variant?: 'card' | 'section'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const active = contacts.filter((c) => c.status === 'active')
  // Primary first when one is designated; the rest keep the loader's stable order. A primary is never invented.
  const current = [...active.filter((c) => c.is_primary_contact), ...active.filter((c) => !c.is_primary_contact)]
  const visible = previewLimit && !showAll ? current.slice(0, previewLimit) : current
  const past = contacts.filter((c) => c.status === 'ended')
  const linkedIds = new Set(current.map((c) => c.person_id))
  const primary = current.find((c) => c.is_primary_contact) ?? null
  const compact = Boolean(previewLimit)
  const embedded = variant === 'section'
  const countLabel = current.length ? `${current.length} current ${current.length === 1 ? 'contact' : 'contacts'}` : 'No current contacts'

  const addButton = canEdit && (
    <Button
      variant="outline"
      size={compact || embedded ? 'sm' : 'default'}
      onClick={() => setOpen(true)}
      disabled={companyInactive}
      title={companyInactive ? 'Activate this company to add contacts' : undefined}
    >
      <Plus data-icon="inline-start" />
      Add contact person
    </Button>
  )

  return (
    <section
      className={
        embedded
          ? `flex min-w-0 flex-col gap-3 ${className ?? ''}`
          : `flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs ${compact ? 'md:p-6' : 'sm:p-6'} ${className ?? ''}`
      }
      aria-labelledby="company-contacts-heading"
    >
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-col">
            <h3 id="company-contacts-heading" className="text-xs font-semibold text-muted-foreground">
              {heading}
            </h3>
            <p className="text-sm text-foreground/80">{countLabel}</p>
          </div>
          {addButton}
        </div>
      ) : compact ? (
        <CardSectionHeader
          id="company-contacts-heading"
          title={heading}
          icon={UsersRound}
          subtitle={current.length ? countLabel : undefined}
          action={addButton}
        />
      ) : (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
              <Users className="size-4" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-0.5 pt-0.5">
              <h2 id="company-contacts-heading" className="text-sm font-semibold text-foreground">
                {heading}
              </h2>
              <p className="text-sm text-muted-foreground">{current.length ? countLabel : 'No contact person added'}</p>
            </div>
          </div>
          {addButton}
        </header>
      )}

      {current.length ? (
        <ul id="company-contacts-list" className="flex flex-col divide-y divide-border/70">
          {visible.map((c) => (
            <ContactRow
              key={c.relationship_id}
              contact={c}
              canEdit={canEdit}
              subcontractor={subcontractor}
              currentPrimary={primary}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          No contact people yet. Add an owner, foreman, or office contact.
        </p>
      )}

      {previewLimit && current.length > previewLimit && (
        <button
          type="button"
          onClick={() => setShowAll((s) => !s)}
          aria-expanded={showAll}
          aria-controls="company-contacts-list"
          className="w-fit rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {showAll ? 'Show fewer contacts' : `View all contacts (${current.length})`}
        </button>
      )}

      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            aria-expanded={showHistory}
            className="w-fit rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {showHistory ? 'Hide' : 'Show'} past contacts ({past.length})
          </button>
          {showHistory && (
            <ul className="flex flex-col divide-y divide-border/70 rounded-lg border border-border/70 bg-muted/30 px-3">
              {past.map((c) => (
                <li key={c.relationship_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={`/contacts/people/${c.person_id}`} className="font-medium text-foreground/80 underline-offset-4 hover:underline">
                    {c.name}
                  </Link>
                  <span className="text-muted-foreground">
                    {[c.role, `${formatDate(c.started_at)} – ${c.ended_at ? formatDate(c.ended_at) : ''}`].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {subcontractor && (
        <datalist id={ROLE_LIST_ID}>
          {SUBCONTRACTOR_CONTACT_ROLES.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      )}

      {canEdit && (
        <AddContactDialog
          open={open}
          onOpenChange={setOpen}
          target={target}
          people={people.filter((p) => !linkedIds.has(p.id))}
          hasPrimary={Boolean(primary)}
          subcontractor={subcontractor}
        />
      )}
    </section>
  )
}

function ContactRow({
  contact: c,
  canEdit,
  subcontractor,
  currentPrimary,
}: {
  contact: CompanyContact
  canEdit: boolean
  subcontractor?: boolean
  currentPrimary: CompanyContact | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [ending, setEnding] = useState(false)
  const tel = telHref(c.primary_phone)

  function makePrimary() {
    startTransition(async () => {
      const r = await setPrimaryContactAction(c.relationship_id)
      if (r.error) toast.error(r.error)
      else {
        toast.success(r.success ?? 'Primary contact updated.')
        router.refresh()
      }
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
          <UserRound className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={`/contacts/people/${c.person_id}`}
              className="min-w-0 break-words font-semibold text-link underline-offset-4 hover:text-link-hover hover:underline"
            >
              {c.name}
            </Link>
            {c.is_primary_contact && (
              <span className="inline-flex items-center gap-1 rounded-badge bg-[#FFF2DA] px-2 py-0.5 text-xs font-medium text-[#96570E]">
                <Star className="size-3 fill-current" aria-hidden="true" />
                Primary
              </span>
            )}
            {c.person_status === 'inactive' && <span className="rounded-badge bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>}
          </div>
          <p className="text-sm font-medium text-foreground/80">{c.role ?? <span className="font-normal text-muted-foreground">No role set</span>}</p>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            {c.email &&
              (isValidEmail(c.email) ? (
                <a
                  href={`mailto:${c.email}`}
                  aria-label={`Email ${c.name} at ${c.email}`}
                  className="inline-flex min-w-0 items-start gap-1.5 hover:text-primary hover:underline underline-offset-4"
                >
                  <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-all">{c.email}</span>
                </a>
              ) : (
                <span className="inline-flex min-w-0 items-start gap-1.5">
                  <Mail className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 break-all">{c.email}</span>
                </span>
              ))}
            {c.primary_phone &&
              (tel ? (
                <a
                  href={tel}
                  aria-label={`Call ${c.name} at ${formatPhone(c.primary_phone)}`}
                  className="inline-flex w-fit items-center gap-1.5 tabular-nums hover:text-primary hover:underline underline-offset-4"
                >
                  <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                  {formatPhone(c.primary_phone)}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                  {c.primary_phone}
                </span>
              ))}
            {!c.email && !c.primary_phone && <span>No email or phone on file</span>}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1 pl-11 sm:pl-0">
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label={`Edit ${c.name}`}>
            <Pencil data-icon="inline-start" />
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More actions for ${c.name}`}
              disabled={pending}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {!c.is_primary_contact && (
                <DropdownMenuItem onClick={makePrimary}>
                  <Star aria-hidden="true" />
                  Make primary contact
                </DropdownMenuItem>
              )}
              <DropdownMenuItem variant="destructive" onClick={() => setEnding(true)}>
                <UserRoundMinus aria-hidden="true" />
                End association
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Mounted only while open so Cancel always discards unsaved input and errors. */}
          {editing && (
            <EditContactDialog
              open
              onOpenChange={setEditing}
              contact={c}
              subcontractor={subcontractor}
              currentPrimary={currentPrimary}
            />
          )}
          <EndAssociationDialog open={ending} onOpenChange={setEnding} contact={c} />
        </div>
      )}
    </li>
  )
}

function EditContactDialog({
  open,
  onOpenChange,
  contact: c,
  subcontractor,
  currentPrimary,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: CompanyContact
  subcontractor?: boolean
  currentPrimary: CompanyContact | null
}) {
  const router = useRouter()
  const [state, formAction] = useActionState(
    (prev: ActionState, fd: FormData) => updateCompanyContactAction(c.relationship_id, prev, fd),
    initialActionState,
  )
  const handled = useRef<ActionState | null>(null)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}

  useEffect(() => {
    if (state.success && handled.current !== state) {
      handled.current = state
      toast.success(state.success)
      onOpenChange(false)
      router.refresh()
    }
  }, [state, onOpenChange, router])

  // A failed save remounts the form with what the user typed so nothing is lost.
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const shared = c.other_company_count > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>Update {c.name}&apos;s details and their role at this company.</DialogDescription>
        </DialogHeader>
        <form key={formKey} action={formAction} className="flex flex-col gap-5" noValidate>
          {c.person_updated_at && <input type="hidden" name="expected_updated_at" value={c.person_updated_at} />}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-xs font-semibold text-muted-foreground">Personal details</legend>
            {shared && (
              <p className="flex items-start gap-2 rounded-lg bg-sage px-3 py-2 text-sm text-foreground/80">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  {`${c.name} is also a contact at ${c.other_company_count} other ${c.other_company_count === 1 ? 'company' : 'companies'}. Changes to personal details update their shared contact record everywhere.`}
                </span>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField name="first_name" label="First name" required defaultValue={v.first_name ?? c.first_name} error={fe.first_name} maxLength={80} />
              <TextField name="last_name" label="Last name" required defaultValue={v.last_name ?? c.last_name} error={fe.last_name} maxLength={80} />
              <TextField name="email" label="Email" type="email" defaultValue={v.email ?? c.email ?? ''} error={fe.email} className="sm:col-span-2" />
              <TextField
                name="primary_phone"
                label="Phone"
                type="tel"
                defaultValue={v.primary_phone ?? c.primary_phone ?? ''}
                error={fe.primary_phone}
                className="sm:col-span-2"
              />
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-3 border-t border-border/60 pt-4">
            <legend className="sr-only">At this company</legend>
            <p aria-hidden="true" className="text-xs font-semibold text-muted-foreground">
              At this company
            </p>
            <TextField
              name="role"
              label="Role"
              defaultValue={v.role ?? c.role ?? ''}
              error={fe.role}
              list={subcontractor ? ROLE_LIST_ID : undefined}
              hint="Only changes their role here, not at other companies."
              maxLength={120}
            />
            {c.is_primary_contact ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <Star className="mt-0.5 size-3.5 shrink-0 fill-[#96570E] text-[#96570E]" aria-hidden="true" />
                Primary contact. To change it, make another contact primary.
              </p>
            ) : (
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" name="make_primary" defaultChecked={v.make_primary === 'on'} className="mt-0.5 size-4 accent-primary" />
                <span className="flex flex-col">
                  Make primary contact for this company
                  {currentPrimary && <span className="text-xs text-muted-foreground">{`Replaces ${currentPrimary.name} as primary.`}</span>}
                </span>
              </label>
            )}
          </fieldset>
          <FormMessage state={state} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton size="default" pendingLabel="Saving…">
              Save changes
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EndAssociationDialog({
  open,
  onOpenChange,
  contact: c,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact: CompanyContact
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    setError(null)
    startTransition(async () => {
      try {
        const r = await endRelationshipAction(c.relationship_id)
        if (r.error) {
          setError(r.error)
          return
        }
        onOpenChange(false)
        toast.success('Association ended. It is kept in past contacts.')
        router.refresh()
      } catch {
        setError('Something went wrong. Nothing was changed. Please try again.')
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <DialogContent showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{`End ${c.name}'s association?`}</DialogTitle>
          <DialogDescription>
            {`${c.name} will move to past contacts for this company. This does not delete the person — their contact record, project history, and other companies stay as they are.`}
          </DialogDescription>
        </DialogHeader>
        {c.is_primary_contact && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {"This is the company's primary contact. No replacement is chosen automatically; make another contact primary afterwards if needed."}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} aria-busy={pending} onClick={confirm}>
            {pending ? 'Ending…' : 'End association'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AddContactDialog({
  open,
  onOpenChange,
  target,
  people,
  hasPrimary,
  subcontractor,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: Target
  people: { id: string; label: string }[]
  hasPrimary: boolean
  subcontractor?: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [state, formAction] = useActionState(
    (prev: ActionState, fd: FormData) => addCompanyContactAction(target, prev, fd),
    initialActionState,
  )
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}

  useEffect(() => {
    if (state.success) {
      toast.success(state.success)
      onOpenChange(false)
      router.refresh()
    }
  }, [state, onOpenChange, router])

  const formKey = state.values ? JSON.stringify(state.values) : `initial-${open}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add contact person</DialogTitle>
          <DialogDescription>Create a new person or link someone already in your directory. People are never merged automatically.</DialogDescription>
        </DialogHeader>
        <div role="radiogroup" aria-label="Contact source" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground'}`}
            >
              {m === 'new' ? 'New person' : 'Existing contact'}
            </button>
          ))}
        </div>
        <form key={formKey} action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="mode" value={mode} />
          {mode === 'existing' ? (
            <div className="flex flex-col gap-2">
              <label htmlFor="person_id" className="text-sm font-medium">
                Contact
              </label>
              <select
                id="person_id"
                name="person_id"
                defaultValue={v.person_id ?? ''}
                aria-invalid={fe.person_id ? true : undefined}
                className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
              >
                <option value="" disabled>
                  {people.length ? 'Choose a contact' : 'No other active contacts'}
                </option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {fe.person_id && <p className="text-xs text-destructive">{fe.person_id}</p>}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField name="first_name" label="First name" required defaultValue={v.first_name ?? ''} error={fe.first_name} maxLength={80} />
              <TextField name="last_name" label="Last name" required defaultValue={v.last_name ?? ''} error={fe.last_name} maxLength={80} />
              <TextField name="email" label="Email" type="email" defaultValue={v.email ?? ''} error={fe.email} className="sm:col-span-2" />
              <TextField name="primary_phone" label="Phone" type="tel" defaultValue={v.primary_phone ?? ''} error={fe.primary_phone} className="sm:col-span-2" />
            </div>
          )}
          <TextField
            name="role"
            label="Role"
            defaultValue={v.role ?? ''}
            error={fe.role}
            list={subcontractor ? ROLE_LIST_ID : undefined}
            hint={subcontractor ? 'Choose a suggestion or type your own.' : 'For example Owner, Estimator, or Sales Rep.'}
            maxLength={120}
          />
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="is_primary" defaultChecked={!hasPrimary || v.is_primary === 'on'} disabled={hasPrimary} className="size-4 accent-primary" />
            {hasPrimary ? 'This company already has a primary contact' : 'Primary contact for this company'}
          </label>
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton size="default" pendingLabel="Saving…">
              {mode === 'existing' ? 'Link contact' : 'Add contact'}
            </SubmitButton>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
