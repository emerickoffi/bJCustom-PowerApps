'use client'

import { useState } from 'react'
import { Check, ChevronDown, Mail, Minus, Pencil, Phone, Plus, ShieldCheck, ShieldOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  addActivityAction,
  addContactAction,
  archiveContactAction,
  inviteClientToPortalAction,
  restoreContactAction,
  setPrimaryContactAction,
  updateContactAction,
} from '@/app/actions/clients'
import {
  ACTIVITY_TYPE_LABELS,
  COMMUNICATION_LABELS,
  CONTACT_PORTAL_PERMISSIONS,
  CONTACT_RELATIONSHIP_LABELS,
} from '@/lib/domain'
import { formatDateTime } from '@/lib/format'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'

export type ContactRow = {
  id: string
  first_name: string
  last_name: string
  middle_name: string | null
  relationship: string
  email: string | null
  phone: string | null
  alternate_phone: string | null
  preferred_communication: string
  is_primary: boolean
  archived_at: string | null
  portal_enabled: boolean
  portal_view_reports: boolean
  portal_validate_issues: boolean
  portal_acknowledge: boolean
  portal_sign: boolean
}

export type ActivityRow = {
  id: string
  activity_type: string
  summary: string
  details: string | null
  created_at: string
  author: string
}

function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function contactName(c: ContactRow) {
  return [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(' ')
}

function ContactFields({ contact }: { contact?: ContactRow }) {
  return (
    <>
      <TextField name="first_name" label="First name" required defaultValue={contact?.first_name} />
      <TextField name="middle_name" label="Middle name" defaultValue={contact?.middle_name ?? ''} />
      <TextField name="last_name" label="Last name" required defaultValue={contact?.last_name} />
      <SelectField
        name="relationship"
        label="Relationship"
        defaultValue={contact?.relationship ?? 'spouse'}
        options={Object.entries(CONTACT_RELATIONSHIP_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <TextField name="email" label="Email" type="email" defaultValue={contact?.email ?? ''} />
      <SelectField
        name="preferred_communication"
        label="Preferred contact"
        defaultValue={contact?.preferred_communication ?? 'email'}
        options={Object.entries(COMMUNICATION_LABELS).map(([value, label]) => ({ value, label }))}
      />
      <TextField name="phone" label="Phone" type="tel" defaultValue={contact?.phone ?? ''} />
      <TextField name="alternate_phone" label="Alternate phone" type="tel" defaultValue={contact?.alternate_phone ?? ''} />
      <fieldset className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
        <legend className="px-1 text-sm font-medium text-foreground">Portal permissions</legend>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="portal_enabled" defaultChecked={contact?.portal_enabled} className="size-4 accent-primary" />
          Can use the homeowner portal
        </label>
        <div className="grid gap-2 pl-6 sm:grid-cols-2">
          {CONTACT_PORTAL_PERMISSIONS.map((p) => (
            <label key={p.key} className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name={p.key} defaultChecked={contact?.[p.key]} className="size-4 accent-primary" />
              {p.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Permissions apply only while portal access is on. Portal access needs an email address.
        </p>
      </fieldset>
    </>
  )
}

function initials(c: ContactRow) {
  return `${c.first_name.charAt(0)}${c.last_name.charAt(0)}`.toUpperCase()
}

function PortalSummary({ contact }: { contact: ContactRow }) {
  if (!contact.portal_enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldOff className="size-3.5" aria-hidden="true" />
        No portal access
      </span>
    )
  }
  const granted = CONTACT_PORTAL_PERMISSIONS.filter((p) => contact[p.key])
  return (
    <details className="group/perm">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-md text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1 rounded-full bg-sage px-2 py-0.5 font-medium text-primary">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Portal access
        </span>
        <span className="text-muted-foreground">
          {`${granted.length} ${granted.length === 1 ? 'permission' : 'permissions'} enabled`}
        </span>
        <ChevronDown
          className="size-3.5 text-muted-foreground transition-transform group-open/perm:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2" aria-label="Portal permissions">
        {CONTACT_PORTAL_PERMISSIONS.map((p) => {
          const on = Boolean(contact[p.key])
          return (
            <li key={p.key} className={cn('flex items-center gap-1.5 text-xs', on ? 'text-foreground' : 'text-muted-foreground')}>
              {on ? (
                <Check className="size-3.5 text-primary" aria-hidden="true" />
              ) : (
                <Minus className="size-3.5" aria-hidden="true" />
              )}
              <span>{p.label}</span>
              <span className="sr-only">{on ? '(enabled)' : '(not enabled)'}</span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function ContactCard({ clientId, contact: c, canEdit }: { clientId: string; contact: ContactRow; canEdit: boolean }) {
  const [editing, setEditing] = useState(false)
  const relationship = CONTACT_RELATIONSHIP_LABELS[c.relationship] ?? c.relationship
  const preferred =
    (COMMUNICATION_LABELS as Record<string, string>)[c.preferred_communication] ?? c.preferred_communication
  const phones = [c.phone, c.alternate_phone].filter(Boolean) as string[]

  return (
    <li className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4', c.is_primary && 'border-primary/20 bg-sage/30')}>
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
            c.is_primary ? 'bg-primary text-primary-foreground' : 'bg-sage text-primary',
          )}
          aria-hidden="true"
        >
          {initials(c)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{contactName(c)}</span>
            {c.is_primary && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[0.7rem] font-medium text-primary-foreground">
                Primary
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{`${relationship} · Prefers ${preferred.toLowerCase()}`}</span>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={editing}
            aria-controls={`contact-edit-${c.id}`}
            onClick={() => setEditing((v) => !v)}
          >
            <Pencil aria-hidden="true" />
            {editing ? 'Close' : 'Edit'}
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 text-sm sm:pl-[3.25rem]">
        {c.email && (
          <a
            href={`mailto:${c.email}`}
            className="inline-flex min-w-0 items-center gap-2 text-foreground underline-offset-4 hover:underline"
          >
            <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{c.email}</span>
          </a>
        )}
        {phones.map((phone) => (
          <a
            key={phone}
            href={`tel:${phone}`}
            className="inline-flex items-center gap-2 text-foreground underline-offset-4 hover:underline"
          >
            <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="tabular">{phone}</span>
          </a>
        ))}
        {!c.email && phones.length === 0 && <span className="text-muted-foreground">No contact details</span>}
        <div className="pt-1">
          <PortalSummary contact={c} />
        </div>
      </div>

      {canEdit && !c.is_primary && (
        <div className="flex flex-wrap items-start justify-end gap-2 border-t pt-3">
          <ActionButton
            variant="outline"
            label="Make primary"
            pendingLabel="Updating..."
            action={() => setPrimaryContactAction(clientId, c.id)}
          />
          <ActionButton
            variant="destructive"
            label="Remove"
            confirmMessage={`Remove ${contactName(c)}? Their portal access ends, but their history is kept.`}
            action={() => archiveContactAction(clientId, c.id)}
          />
        </div>
      )}

      {canEdit && editing && (
        <InlineActionForm
          action={updateContactAction.bind(null, clientId, c.id)}
          className="grid gap-3 border-t pt-4 sm:grid-cols-2"
        >
          <div id={`contact-edit-${c.id}`} className="contents">
            <ContactFields contact={c} />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <SubmitButton pendingLabel="Saving...">Save contact</SubmitButton>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </InlineActionForm>
      )}
    </li>
  )
}

export function ContactsPanel({ clientId, contacts, canEdit }: { clientId: string; contacts: ContactRow[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false)
  const active = contacts
    .filter((c) => !c.archived_at)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
  const archived = contacts.filter((c) => c.archived_at)
  return (
    <div id="contacts" className="scroll-mt-24">
    <Panel
      title="Contacts"
      description="Manage homeowners and authorized contacts."
      actions={
        canEdit && (
          <Button
            type="button"
            className="w-full sm:w-auto"
            aria-expanded={adding}
            aria-controls="contact-add-form"
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {adding ? 'Cancel' : 'Add contact'}
          </Button>
        )
      }
    >
      {canEdit && adding && (
        <div id="contact-add-form" className="rounded-lg border bg-sage/30 p-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">New contact</h3>
          <InlineActionForm action={addContactAction.bind(null, clientId)} className="grid gap-3 sm:grid-cols-2">
            <ContactFields />
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Adding...">Add contact</SubmitButton>
            </div>
          </InlineActionForm>
        </div>
      )}
      {active.length ? (
        <ul className="flex flex-col gap-3">
          {active.map((c) => (
            <ContactCard key={c.id} clientId={clientId} contact={c} canEdit={canEdit} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No contacts yet.</p>
      )}
      {archived.length > 0 && (
        <details className="border-t pt-4">
          <summary className="cursor-pointer list-none text-sm text-muted-foreground">
            {`Removed contacts (${archived.length})`}
          </summary>
          <ul className="mt-2 flex flex-col divide-y">
            {archived.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="text-sm text-muted-foreground">{contactName(c)}</span>
                {canEdit && (
                  <ActionButton label="Restore" pendingLabel="Restoring..." action={() => restoreContactAction(clientId, c.id)} />
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
    </div>
  )
}

export function ActivityPanel({ clientId, activity }: { clientId: string; activity: ActivityRow[] }) {
  const loggable = Object.entries(ACTIVITY_TYPE_LABELS).filter(([value]) => value !== 'system')
  return (
    <Panel title="Communication log" description="Calls, meetings, site visits, and notes. Internal to your team.">
      <InlineActionForm action={addActivityAction.bind(null, clientId)} className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <SelectField
          name="activity_type"
          label="Type"
          defaultValue="note"
          options={loggable.map(([value, label]) => ({ value, label }))}
        />
        <TextField name="summary" label="Summary" required maxLength={500} placeholder="Discussed lot options" />
        <TextAreaField name="details" label="Details" className="sm:col-span-2" />
        <div className="sm:col-span-2">
          <SubmitButton variant="outline" pendingLabel="Logging...">
            Log activity
          </SubmitButton>
        </div>
      </InlineActionForm>
      {activity.length > 0 && (
        <ol className="flex flex-col border-t">
          {activity.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{item.summary}</span>
                <time dateTime={item.created_at} className="text-xs text-muted-foreground">
                  {formatDateTime(item.created_at)}
                </time>
              </div>
              {item.details && <p className="whitespace-pre-line text-sm text-muted-foreground">{item.details}</p>}
              <span className="text-xs text-muted-foreground">
                {`${ACTIVITY_TYPE_LABELS[item.activity_type] ?? item.activity_type} · ${item.author}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

export function PortalAccessPanel({
  clientId,
  hasAccess,
  pendingInvite,
  email,
}: {
  clientId: string
  hasAccess: boolean
  pendingInvite: boolean
  email: string | null
}) {
  return (
    <Panel title="Homeowner portal">
      {hasAccess ? (
        <p className="text-sm text-muted-foreground">This homeowner has portal access and can view their projects.</p>
      ) : pendingInvite ? (
        <p className="text-sm text-muted-foreground">
          {`Invitation pending for ${email}. They gain access when they sign up and confirm that email.`}
        </p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            {email
              ? `Invite ${email} to view project progress in the homeowner portal.`
              : 'Add an email address to this client to invite them to the portal.'}
          </p>
          {email && (
            <ActionButton
              variant="outline"
              size="default"
              label="Invite to portal"
              pendingLabel="Inviting..."
              action={() => inviteClientToPortalAction(clientId)}
            />
          )}
        </div>
      )}
    </Panel>
  )
}
