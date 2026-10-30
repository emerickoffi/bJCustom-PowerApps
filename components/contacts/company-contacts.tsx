'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Mail, Phone, Plus, Star, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { formatDate, formatPhone } from '@/lib/format'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ConfirmActionButton } from '@/components/shared/confirm-action-button'
import { addCompanyContactAction, endRelationshipAction, setPrimaryContactAction } from '@/app/actions/contacts'
import { SUBCONTRACTOR_CONTACT_ROLES } from '@/lib/contacts'
import type { CompanyContact } from '@/lib/contacts-data'

type Target = { companyId: string } | { subcontractorId: string }

/**
 * Lists a company's contact persons with current and past relationships, and lets managers add a new or existing
 * person, set the primary contact, or end a relationship. Used on company profiles and Subcontractor pages.
 */
export function CompanyContacts({
  target,
  contacts,
  people,
  canEdit,
  companyInactive,
  subcontractor,
}: {
  target: Target
  contacts: CompanyContact[]
  people: { id: string; label: string }[]
  canEdit: boolean
  companyInactive?: boolean
  /** Uses the subcontractor role presets. */
  subcontractor?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const current = contacts.filter((c) => c.status === 'active')
  const past = contacts.filter((c) => c.status === 'ended')
  const linkedIds = new Set(current.map((c) => c.person_id))

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-6" aria-labelledby="company-contacts-heading">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
            <Users className="size-4" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <h2 id="company-contacts-heading" className="text-sm font-semibold text-foreground">
              Contact persons
            </h2>
            <p className="text-sm text-muted-foreground">
              {current.length ? `${current.length} current ${current.length === 1 ? 'contact' : 'contacts'}` : 'No current contacts yet'}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" onClick={() => setOpen(true)} disabled={companyInactive} title={companyInactive ? 'Activate this company to add contacts' : undefined}>
            <Plus data-icon="inline-start" />
            Add contact person
          </Button>
        )}
      </header>

      {current.length ? (
        <ul className="flex flex-col divide-y divide-border/70">
          {current.map((c) => (
            <ContactRow key={c.relationship_id} contact={c} canEdit={canEdit} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Add the people your team talks to at this company, such as the owner, foreman, or office contact.</p>
      )}

      {past.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory} className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline">
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

      {canEdit && (
        <AddContactDialog
          open={open}
          onOpenChange={setOpen}
          target={target}
          people={people.filter((p) => !linkedIds.has(p.id))}
          hasPrimary={current.some((c) => c.is_primary_contact)}
          subcontractor={subcontractor}
        />
      )}
    </section>
  )
}

function ContactRow({ contact: c, canEdit }: { contact: CompanyContact; canEdit: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <li className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
          <UserRound className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/contacts/people/${c.person_id}`} className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline">
              {c.name}
            </Link>
            {c.is_primary_contact && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF2DA] px-2 py-0.5 text-xs font-medium text-[#96570E]">
                <Star className="size-3 fill-current" aria-hidden="true" />
                Primary
              </span>
            )}
            {c.person_status === 'inactive' && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Inactive</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.role && <span className="font-medium text-foreground/80">{c.role}</span>}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-primary">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{c.email}</span>
              </a>
            )}
            {c.primary_phone && (
              <a href={`tel:${c.primary_phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-1.5 tabular-nums hover:text-primary">
                <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                {formatPhone(c.primary_phone)}
              </a>
            )}
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-2 pl-11 sm:pl-0">
          {!c.is_primary_contact && (
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await setPrimaryContactAction(c.relationship_id)
                  if (r.error) toast.error(r.error)
                  else {
                    toast.success(r.success ?? 'Primary contact updated.')
                    router.refresh()
                  }
                })
              }
            >
              {pending ? 'Saving…' : 'Make primary'}
            </Button>
          )}
          <ConfirmActionButton
            variant="ghost"
            size="sm"
            label="End"
            title={`End ${c.name}'s relationship?`}
            description="They will move to past contacts. Their profile, project history, and other companies are not affected."
            confirmLabel="End relationship"
            pendingLabel="Ending…"
            action={async () => {
              const r = await endRelationshipAction(c.relationship_id)
              if (!r.error) router.refresh()
              return r
            }}
          />
        </div>
      )}
    </li>
  )
}

function AddContactDialog({
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
  const roleListId = 'contact-role-options'

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
            list={subcontractor ? roleListId : undefined}
            hint={subcontractor ? 'Choose a suggestion or type your own.' : 'For example Owner, Estimator, or Sales Rep.'}
            maxLength={120}
          />
          {subcontractor && (
            <datalist id={roleListId}>
              {SUBCONTRACTOR_CONTACT_ROLES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          )}
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
