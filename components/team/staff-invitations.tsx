'use client'

import { useActionState, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { inviteStaffAction, reissueInvitationLinkAction, revokeInvitationAction, type InviteState } from '@/app/actions/team'
import { ROLE_LABELS, STAFF_ROLES, type OrgRole } from '@/lib/domain'
import { formatDate } from '@/lib/format'
import { SelectField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ActionButton } from '@/components/shared/inline-action'
import { Button } from '@/components/ui/button'

export type ProjectOption = { id: string; label: string }
export type InvitationRow = {
  id: string
  email: string
  role: OrgRole
  created_at: string
  expires_at: string
  project_count: number
  has_link: boolean
}

const roleOptions = STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))
const initial: InviteState = {}

function InviteLinkHandoff({ url, email }: { url: string; email?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-sage/40 p-4 text-sm">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Link2 className="size-4" aria-hidden="true" />
        Invitation link
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-md bg-card px-2 py-1.5 font-mono text-xs text-foreground">{url}</code>
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {`Send this link to ${email ?? 'the invited person'}. It works once, only for that email address, and expires in 14 days. They choose their own password. The link is not stored and will not be shown again.`}
      </p>
    </div>
  )
}

export function InviteStaffForm({ projects }: { projects: ProjectOption[] }) {
  const [state, formAction] = useActionState(inviteStaffAction, initial)
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <TextField
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="off"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <SelectField
        name="role"
        label="Role"
        defaultValue={state.values?.role ?? 'builder_staff'}
        options={roleOptions}
        error={state.fieldErrors?.role}
      />
      <dl className="flex flex-col gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        <div>
          <dt className="inline font-medium text-foreground">Administrator: </dt>
          <dd className="inline">Full access, including team and company settings.</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Project manager: </dt>
          <dd className="inline">Manages all clients and projects.</dd>
        </div>
        <div>
          <dt className="inline font-medium text-foreground">Builder staff: </dt>
          <dd className="inline">Sees only projects they are assigned to.</dd>
        </div>
      </dl>
      {projects.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-foreground">Assign to projects</legend>
          <p className="text-xs text-muted-foreground">Applied when the invitation is accepted.</p>
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
            {projects.map((p) => (
              <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" name="project_ids" value={p.id} className="size-4 accent-primary" />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <FormMessage state={state} />
      {state.inviteUrl && <InviteLinkHandoff url={state.inviteUrl} email={state.inviteEmail} />}
      <SubmitButton pendingLabel="Creating...">Create invitation</SubmitButton>
    </form>
  )
}

function ReissueLink({ invitationId, hasLink }: { invitationId: string; hasLink: boolean }) {
  const [state, formAction] = useActionState(reissueInvitationLinkAction, initial)
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="invitation_id" value={invitationId} />
      <SubmitButton variant="outline" size="sm" pendingLabel="Issuing...">
        {hasLink ? 'Issue new link' : 'Create link'}
      </SubmitButton>
      {state.error && <FormMessage state={state} />}
      {state.inviteUrl && <InviteLinkHandoff url={state.inviteUrl} email={state.inviteEmail} />}
    </form>
  )
}

export function InvitationList({ invitations }: { invitations: InvitationRow[] }) {
  if (!invitations.length) return null
  return (
    <section aria-labelledby="invites-heading" className="flex flex-col gap-4">
      <h2 id="invites-heading" className="font-serif text-lg font-semibold text-foreground">
        Pending invitations
      </h2>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {invitations.map((inv) => {
          const expired = new Date(inv.expires_at).getTime() <= Date.now()
          const projects = inv.project_count ? ` · ${inv.project_count} project${inv.project_count === 1 ? '' : 's'}` : ''
          return (
            <li key={inv.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{inv.email}</span>
                <span className="text-sm text-muted-foreground">
                  {`${ROLE_LABELS[inv.role]}${projects} · ${expired ? 'expired' : 'expires'} ${formatDate(inv.expires_at)}`}
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <ReissueLink invitationId={inv.id} hasLink={inv.has_link} />
                <ActionButton
                  label="Revoke"
                  confirmMessage="Revoke this invitation? Its link stops working immediately."
                  action={() => revokeInvitationAction(inv.id)}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
