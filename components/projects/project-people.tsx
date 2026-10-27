'use client'

import Link from 'next/link'
import {
  addProjectClientAction,
  addProjectMemberAction,
  removeProjectClientAction,
  removeProjectMemberAction,
} from '@/app/actions/projects'
import { PROJECT_CLIENT_RELATIONSHIP_LABELS } from '@/lib/domain'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { SelectField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'

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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-serif text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
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

  return (
    <Panel title="Homeowners">
      <ul className="flex flex-col divide-y">
        {links.map((link) => (
          <li key={link.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
            <div className="flex min-w-0 flex-col">
              {link.client ? (
                <Link
                  href={`/clients/${link.client.id}`}
                  className="truncate font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {`${link.client.first_name} ${link.client.last_name}`}
                </Link>
              ) : (
                <span className="text-muted-foreground">Unavailable client</span>
              )}
              <span className="text-xs text-muted-foreground">
                {PROJECT_CLIENT_RELATIONSHIP_LABELS[link.relationship] ?? link.relationship}
              </span>
            </div>
            {canEdit && link.relationship !== 'primary_owner' && (
              <ActionButton
                label="Remove"
                confirmMessage="Remove this client from the project?"
                action={() => removeProjectClientAction(projectId, link.id)}
              />
            )}
          </li>
        ))}
      </ul>
      {canEdit && available.length > 0 && (
        <InlineActionForm
          action={addProjectClientAction.bind(null, projectId)}
          className="grid gap-3 border-t pt-4"
        >
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
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Project manager</span>
        <span className="font-medium text-foreground">{managerName ?? 'Unassigned'}</span>
      </div>
      {members.length > 0 && (
        <ul className="flex flex-col divide-y border-t">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col">
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
      )}
      {canEdit && available.length > 0 && (
        <InlineActionForm
          action={addProjectMemberAction.bind(null, projectId)}
          className="grid gap-3 border-t pt-4"
        >
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
