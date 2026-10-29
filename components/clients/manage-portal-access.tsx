'use client'

import { useActionState } from 'react'
import {
  createPortalAccountAction,
  reissuePortalPasswordAction,
  setPortalStatusAction,
  updatePortalProjectsAction,
  type ProvisionState,
} from '@/app/actions/provisioning'
import { initialActionState } from '@/lib/action-state'
import { Badge } from '@/components/ui/badge'
import { SelectField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ActionButton } from '@/components/shared/inline-action'
import { CredentialHandoff } from '@/components/account/credential-handoff'

export type PortalContactOption = { value: string; label: string; hasEmail: boolean; hasAccount: boolean }
export type PortalProjectOption = { id: string; label: string }
export type PortalAccountRow = {
  id: string
  name: string
  email: string | null
  status: 'active' | 'suspended'
  activationRequired: boolean
  projectIds: string[]
}

const initial: ProvisionState = {}

function ProjectChecklist({ projects, selected }: { projects: PortalProjectOption[]; selected?: string[] }) {
  if (!projects.length) {
    return <p className="text-xs text-muted-foreground">Link a project to this client first to grant access.</p>
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-foreground">Projects they can see</legend>
      {projects.map((p) => (
        <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
          <input
            type="checkbox"
            name="project_ids"
            value={p.id}
            defaultChecked={selected?.includes(p.id)}
            className="size-4 accent-primary"
          />
          {p.label}
        </label>
      ))}
    </fieldset>
  )
}

function AccountStatus({ account }: { account: PortalAccountRow }) {
  if (account.status === 'suspended') return <Badge variant="destructive">Suspended</Badge>
  if (account.activationRequired) return <Badge variant="outline">Awaiting first sign-in</Badge>
  return <Badge variant="secondary">Active</Badge>
}

function AccountItem({ account, projects }: { account: PortalAccountRow; projects: PortalProjectOption[] }) {
  const [projectState, projectAction] = useActionState(updatePortalProjectsAction, initialActionState)
  const [credState, credAction] = useActionState(reissuePortalPasswordAction, initial)
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{account.name}</span>
          <span className="break-all text-xs text-muted-foreground">{account.email}</span>
        </div>
        <AccountStatus account={account} />
      </div>
      <form action={projectAction} className="flex flex-col gap-2">
        <input type="hidden" name="portal_account_id" value={account.id} />
        <ProjectChecklist projects={projects} selected={account.projectIds} />
        <FormMessage state={projectState} />
        {projects.length > 0 && (
          <SubmitButton variant="outline" size="sm" pendingLabel="Saving...">
            Save project access
          </SubmitButton>
        )}
      </form>
      <div className="flex flex-wrap gap-2">
        <ActionButton
          variant="outline"
          size="sm"
          label={account.status === 'suspended' ? 'Restore access' : 'Suspend access'}
          pendingLabel="Updating..."
          action={() => setPortalStatusAction(account.id, account.status === 'suspended' ? 'active' : 'suspended')}
        />
        {account.activationRequired && (
          <form action={credAction}>
            <input type="hidden" name="portal_account_id" value={account.id} />
            <SubmitButton variant="outline" size="sm" pendingLabel="Issuing...">
              New temporary password
            </SubmitButton>
          </form>
        )}
      </div>
      {credState.error && <FormMessage state={credState} />}
      {credState.credential && <CredentialHandoff credential={credState.credential} />}
    </li>
  )
}

export function ManagePortalAccessPanel({
  clientId,
  contacts,
  projects,
  accounts,
}: {
  clientId: string
  contacts: PortalContactOption[]
  projects: PortalProjectOption[]
  accounts: PortalAccountRow[]
}) {
  const [state, formAction] = useActionState(createPortalAccountAction, initial)
  const available = contacts.filter((c) => c.hasEmail)

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-semibold text-foreground">Manage portal access</h2>
        <p className="text-sm text-muted-foreground">
          Homeowners see only the projects you tick here, and only documents shared with clients.
        </p>
      </div>

      {accounts.length > 0 && <ul className="flex flex-col divide-y">{accounts.map((a) => <AccountItem key={a.id} account={a} projects={projects} />)}</ul>}

      <form action={formAction} className="flex flex-col gap-3 rounded-lg bg-muted/60 p-4">
        <input type="hidden" name="client_id" value={clientId} />
        <h3 className="text-sm font-semibold text-foreground">Add a homeowner login</h3>
        {available.length ? (
          <>
            <SelectField
              name="contact"
              label="Homeowner contact"
              placeholder="Select a contact"
              required
              options={available.map((c) => ({ value: c.value, label: c.label, disabled: c.hasAccount }))}
              error={state.fieldErrors?.contact}
            />
            <ProjectChecklist projects={projects} />
            <FormMessage state={state} />
            {state.credential && <CredentialHandoff credential={state.credential} />}
            <SubmitButton size="default" pendingLabel="Creating...">
              Create portal login
            </SubmitButton>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Add an email address to the client or a contact to create a login.</p>
        )}
      </form>
    </section>
  )
}
