'use client'

import Link from 'next/link'
import { Mail, UserCog, Users } from 'lucide-react'
import {
  addProjectClientAction,
  addProjectMemberAction,
  removeProjectClientAction,
  removeProjectMemberAction,
} from '@/app/actions/projects'
import { PROJECT_CLIENT_RELATIONSHIP_LABELS } from '@/lib/domain'
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

export function ProjectClientsPanel({
  projectId,
  links,
  clientOptions,
  canEdit,
}: {
  projectId: string
  links: ProjectClientLink[]
  clientOptions: Option[]
  canEdit: boolean
}) {
  const linked = new Set(links.map((l) => l.client?.id))
  const available = clientOptions.filter((o) => !linked.has(o.value))
  const primary = links.find((l) => l.relationship === 'primary_owner')?.client ?? links[0]?.client ?? null

  return (
    <Panel
      title="Homeowners"
      action={primary ? <PanelLink href={`/clients/${primary.id}`} icon={Users}>Manage contacts</PanelLink> : undefined}
    >
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">No homeowners linked to this project.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {links.map((link) => {
            const name = link.client ? `${link.client.first_name} ${link.client.last_name}` : 'Unavailable client'
            const isPrimary = link.relationship === 'primary_owner'
            return (
              <li key={link.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={name} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {link.client ? (
                      <Link
                        href={`/clients/${link.client.id}`}
                        className="truncate font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{name}</span>
                    )}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[11px] font-medium',
                        isPrimary ? 'bg-[#EAF0E9] text-[#174D32]' : 'bg-[#F8F7F3] text-muted-foreground',
                      )}
                    >
                      {isPrimary ? 'Primary' : 'Additional'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {PROJECT_CLIENT_RELATIONSHIP_LABELS[link.relationship] ?? link.relationship}
                  </span>
                  {link.client?.email && (
                    <a
                      href={`mailto:${link.client.email}`}
                      className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Mail className="size-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{link.client.email}</span>
                    </a>
                  )}
                </div>
                {canEdit && !isPrimary && (
                  <ConfirmActionButton
                    label="Remove"
                    title="Remove contact?"
                    description={`Are you sure you want to remove ${name} from this project?`}
                    warning="This action will remove the contact's association with this project. Review any related portal access before proceeding."
                    confirmLabel="Remove contact"
                    action={() => removeProjectClientAction(projectId, link.id)}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}
      {canEdit && available.length > 0 && (
        <InlineActionForm action={addProjectClientAction.bind(null, projectId)} className="grid gap-3 border-t pt-4">
          <SelectField name="client_id" label="Add client" required placeholder="Select a client" options={available} />
          <SelectField
            name="relationship"
            label="Relationship"
            options={[
              { value: 'co_owner', label: 'Co-owner' },
              { value: 'authorized_contact', label: 'Authorized contact' },
            ]}
            defaultValue="co_owner"
          />
          <SubmitButton variant="outline" pendingLabel="Adding...">
            Add to project
          </SubmitButton>
        </InlineActionForm>
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
