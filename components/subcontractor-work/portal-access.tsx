'use client'

import { useActionState } from 'react'
import { Badge } from '@/components/ui/badge'
import { TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { ActionButton } from '@/components/shared/inline-action'
import { CredentialHandoff } from '@/components/account/credential-handoff'
import {
  inviteSubcontractorUserAction,
  reissueSubcontractorPasswordAction,
  setSubcontractorUserStatusAction,
  type SubPortalState,
} from '@/app/actions/subcontractor-portal'

export type SubPortalAccountRow = { id: string; name: string; email: string; status: 'active' | 'revoked' }

const initial: SubPortalState = {}

function AccountItem({ account, canEdit }: { account: SubPortalAccountRow; canEdit: boolean }) {
  const [credState, credAction] = useActionState(() => reissueSubcontractorPasswordAction(account.id), initial)
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{account.name}</span>
          <span className="break-all text-xs text-muted-foreground">{account.email}</span>
        </div>
        {account.status === 'revoked' ? <Badge variant="destructive">Revoked</Badge> : <Badge variant="secondary">Active</Badge>}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {account.status === 'active' ? (
            <>
              <ActionButton
                action={() => setSubcontractorUserStatusAction(account.id, 'revoked')}
                label="Revoke access"
                pendingLabel="Revoking..."
                confirmMessage={`Revoke portal access for ${account.name}? They will immediately lose access to assigned work and uploads.`}
                variant="outline"
              />
              <form action={credAction}>
                <SubmitButton variant="ghost" size="sm" pendingLabel="Issuing...">
                  New temporary password
                </SubmitButton>
              </form>
            </>
          ) : (
            <ActionButton
              action={() => setSubcontractorUserStatusAction(account.id, 'active')}
              label="Restore access"
              pendingLabel="Restoring..."
              variant="outline"
            />
          )}
        </div>
      )}
      <FormMessage state={credState} />
      {credState.credential && <CredentialHandoff credential={credState.credential} />}
    </li>
  )
}

export function SubcontractorPortalAccess({
  companyId,
  accounts,
  canEdit,
  companyInactive,
}: {
  companyId: string
  accounts: SubPortalAccountRow[]
  canEdit: boolean
  companyInactive: boolean
}) {
  const [state, formAction] = useActionState(inviteSubcontractorUserAction, initial)
  return (
    <div className="flex flex-col gap-4">
      {accounts.length ? (
        <ul className="flex flex-col divide-y divide-border">
          {accounts.map((a) => (
            <AccountItem key={a.id} account={a} canEdit={canEdit} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No one at this company can sign in. Contacts listed above do not receive portal access automatically.
        </p>
      )}

      {canEdit && !companyInactive && (
        <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-foreground">Invite a person</p>
          <input type="hidden" name="company_id" value={companyId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField name="full_name" label="Full name" required defaultValue={state.values?.full_name} error={state.fieldErrors?.full_name} />
            <TextField
              name="email"
              label="Email"
              type="email"
              autoComplete="off"
              required
              defaultValue={state.values?.email}
              error={state.fieldErrors?.email}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            They will see only work and punch list items assigned to this company, with no pricing or homeowner details.
          </p>
          <FormMessage state={state} />
          {state.credential && <CredentialHandoff credential={state.credential} />}
          <SubmitButton size="default" pendingLabel="Inviting...">
            Grant portal access
          </SubmitButton>
        </form>
      )}
      {!canEdit && <p className="text-xs text-muted-foreground">Only administrators can grant or revoke portal access.</p>}
    </div>
  )
}
