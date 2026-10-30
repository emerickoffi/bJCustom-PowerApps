'use client'

import Link from 'next/link'
import { KeyRound, Mail, Phone, UserCog, Users } from 'lucide-react'
import {
  addProjectMemberAction,
  removeProjectClientAction,
  removeProjectMemberAction,
} from '@/app/actions/projects'
import { CONTACT_RELATIONSHIP_LABELS, PROJECT_CLIENT_RELATIONSHIP_LABELS } from '@/lib/domain'
import { HOMEOWNER_PORTAL_STATUS } from '@/lib/project-homeowners'
import type { HomeownerContact, ProjectHomeowners } from '@/lib/project-homeowners-data'
import { AddAdditionalContactDialog } from '@/components/projects/add-additional-contact-dialog'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { ConfirmActionButton } from '@/components/shared/confirm-action-button'
import { SelectField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'
import { cn } from '@/lib/utils'

type Option = { value: string; label: string }

export type ProjectClientLink = {
  id: string
  relationship: string
  client: { id: string; first_name: string; last_name: string; email: string | null } | null
}

export type ProjectMemberRow = { id: string; user_id: string; project_role: string; name: string }

const MEMBER_ROLE_LABELS: Record<string, string> = {
  project_manager: 'Project manager',
  staff: 'Staff',
  viewer: 'Viewer',
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

function Avatar({ name, tone = 'sage' }: { name: string; tone?: 'sage' | 'primary' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        tone === 'primary' ? 'bg-primary text-primary-foreground' : 'bg-[#EAF0E9] text-[#174D32]',
      )}
    >
      {initials(name)}
    </span>
  )
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function PanelLink({ href, icon: Icon, children }: { href: string; icon: typeof Users; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-[#EAF0E9]"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {children}
    </Link>
  )
}

const PORTAL_TONE: Record<string, string> = {
  sage: 'bg-[#EAF0E9] text-[#174D32]',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-destructive/10 text-destructive',
  neutral: 'bg-[#F8F7F3] text-muted-foreground',
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', className)}>{children}</span>
}

function ContactLine({ contact }: { contact: HomeownerContact }) {
  const portal = contact.portalStatus ? HOMEOWNER_PORTAL_STATUS[contact.portalStatus] : null
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <Avatar name={contact.name} tone={contact.isPrimary ? 'primary' : 'sage'} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-foreground">{contact.name}</span>
          <Pill className={contact.isPrimary ? PORTAL_TONE.sage : PORTAL_TONE.neutral}>
            {contact.isPrimary ? 'Primary' : 'Additional'}
          </Pill>
          {contact.projectOnly && <Pill className={PORTAL_TONE.neutral}>This project</Pill>}
        </div>
        <span className="text-xs text-muted-foreground">
          {CONTACT_RELATIONSHIP_LABELS[contact.relationship] ?? contact.relationship}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Mail className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
          {[contact.phone, contact.alternate_phone].filter(Boolean).map((phone) => (
            <a key={phone} href={`tel:${phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Phone className="size-3 shrink-0" aria-hidden="true" />
              {phone}
            </a>
          ))}
        </div>
        {portal && <Pill className={cn('mt-1 w-fit', PORTAL_TONE[portal.tone])}>{portal.label}</Pill>}
      </div>
    </li>
  )
}

export function ProjectClientsPanel({
  projectId,
  homeowners,
  canEdit,
}: {
  projectId: string
  homeowners: ProjectHomeowners
  canEdit: boolean
}) {
  const { groups, primaryClientId } = homeowners
  const primaryGroup = groups.find((g) => g.client?.id === primaryClientId)

  return (
    <Panel
      title="Homeowners"
      action={
        primaryClientId ? (
          <PanelLink href={`/clients/${primaryClientId}`} icon={Users}>
            Manage contacts
          </PanelLink>
        ) : undefined
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No homeowners linked to this project.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const isPrimaryLink = group.client?.id === primaryClientId
            const contacts: HomeownerContact[] =
              group.contacts.length > 0 || !group.client
                ? group.contacts
                : [
                    {
                      id: group.client.id,
                      name: group.client.name,
                      relationship: 'primary_owner',
                      email: group.client.email,
                      phone: group.client.phone,
                      alternate_phone: null,
                      isPrimary: true,
                      projectOnly: false,
                      portalStatus: null,
                    },
                  ]
            return (
              <div key={group.linkId} className={cn('flex flex-col gap-2', !isPrimaryLink && 'border-t pt-4')}>
                {!isPrimaryLink && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {'Linked homeowner · '}
                      {PROJECT_CLIENT_RELATIONSHIP_LABELS[group.linkRelationship] ?? group.linkRelationship}
                    </span>
                    {canEdit && group.client && (
                      <ConfirmActionButton
                        label="Unlink"
                        title="Unlink homeowner?"
                        description={`Remove ${group.client.name} from this project? Their client record is not deleted.`}
                        warning="Review any related portal access before proceeding."
                        confirmLabel="Unlink homeowner"
                        action={() => removeProjectClientAction(projectId, group.linkId)}
                      />
                    )}
                  </div>
                )}
                {group.client ? (
                  <ul className="flex flex-col divide-y">
                    {contacts.map((c) => (
                      <ContactLine key={c.id} contact={c} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Unavailable client</p>
                )}
              </div>
            )
          })}
        </div>
      )}
      {canEdit && primaryGroup?.client && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <AddAdditionalContactDialog
            projectId={projectId}
            homeownerName={primaryGroup.client.name}
            existingContacts={homeowners.primaryContacts}
            scopingAvailable={homeowners.scopingAvailable}
          />
          <PanelLink href={`/clients/${primaryGroup.client.id}#portal-access`} icon={KeyRound}>
            Manage access
          </PanelLink>
        </div>
      )}
    </Panel>
  )
}

export function ProjectTeamPanel({
  projectId,
  managerName,
  members,
  staffOptions,
  canEdit,
}: {
  projectId: string
  managerName: string | null
  members: ProjectMemberRow[]
  staffOptions: Option[]
  canEdit: boolean
}) {
  const assigned = new Set(members.map((m) => m.user_id))
  const available = staffOptions.filter((o) => !assigned.has(o.value))

  return (
    <Panel title="Builder team">
      <div className="flex items-center gap-3 rounded-lg border border-[#D5E2D3] bg-[#EAF0E9]/60 p-3">
        {managerName ? (
          <Avatar name={managerName} tone="primary" />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[#174D32]/40 text-[#174D32]">
            <UserCog className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[11px] font-medium uppercase tracking-wide text-[#174D32]">Project manager</span>
          <span className="truncate font-medium text-foreground">{managerName ?? 'Unassigned'}</span>
        </div>
        {canEdit && (
          <PanelLink href={`/projects/${projectId}/edit`} icon={UserCog}>
            {managerName ? 'Change' : 'Assign'}
          </PanelLink>
        )}
      </div>
      {members.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 py-3 last:pb-0">
              <Avatar name={member.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium text-foreground">{member.name}</span>
                <span className="text-xs text-muted-foreground">
                  {MEMBER_ROLE_LABELS[member.project_role] ?? member.project_role}
                </span>
              </div>
              {canEdit && (
                <ActionButton
                  label="Remove"
                  confirmMessage="Remove this person from the project?"
                  action={() => removeProjectMemberAction(projectId, member.id)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No additional team members assigned.</p>
      )}
      {canEdit && available.length > 0 && (
        <InlineActionForm action={addProjectMemberAction.bind(null, projectId)} className="grid gap-3 border-t pt-4">
          <SelectField name="user_id" label="Add team member" required placeholder="Select a person" options={available} />
          <SelectField
            name="project_role"
            label="Project role"
            options={Object.entries(MEMBER_ROLE_LABELS).map(([value, label]) => ({ value, label }))}
            defaultValue="staff"
          />
          <SubmitButton variant="outline" pendingLabel="Adding...">
            Add to team
          </SubmitButton>
        </InlineActionForm>
      )}
    </Panel>
  )
}
