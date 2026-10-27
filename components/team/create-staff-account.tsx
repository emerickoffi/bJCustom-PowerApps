'use client'

import { useActionState } from 'react'
import { createStaffAccountAction, reissueTemporaryPasswordAction, type ProvisionState } from '@/app/actions/provisioning'
import { ROLE_LABELS, STAFF_ROLES } from '@/lib/domain'
import { SelectField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { CredentialHandoff } from '@/components/account/credential-handoff'

export type ProjectOption = { id: string; label: string }
export type PendingActivation = { membershipId: string; name: string; email: string | null }

const roleOptions = STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))
const initial: ProvisionState = {}

export function CreateStaffAccountForm({ projects }: { projects: ProjectOption[] }) {
  const [state, formAction] = useActionState(createStaffAccountAction, initial)
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-semibold text-foreground">Create staff account</h2>
        <p className="text-sm text-muted-foreground">
          Creates a login directly, with no email needed. You hand over a one-time temporary password.
        </p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        <TextField name="full_name" label="Full name" required defaultValue={state.values?.full_name} error={state.fieldErrors?.full_name} />
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
        {projects.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-foreground">Assign to projects</legend>
            <p className="text-xs text-muted-foreground">Builder staff only see projects they are assigned to.</p>
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
        {state.credential && <CredentialHandoff credential={state.credential} />}
        <SubmitButton pendingLabel="Creating...">Create account</SubmitButton>
      </form>
    </section>
  )
}

function ReissueButton({ membershipId }: { membershipId: string }) {
  const [state, formAction] = useActionState(reissueTemporaryPasswordAction, initial)
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="membership_id" value={membershipId} />
      <SubmitButton variant="outline" size="sm" pendingLabel="Issuing...">
        Issue new temporary password
      </SubmitButton>
      {state.error && <FormMessage state={state} />}
      {state.credential && <CredentialHandoff credential={state.credential} />}
    </form>
  )
}

export function PendingActivationList({ accounts }: { accounts: PendingActivation[] }) {
  if (!accounts.length) return null
  return (
    <section aria-labelledby="pending-activation" className="flex flex-col gap-4">
      <h2 id="pending-activation" className="font-serif text-lg font-semibold text-foreground">
        Awaiting first sign-in
      </h2>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {accounts.map((a) => (
          <li key={a.membershipId} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col">
              <span className="font-medium text-foreground">{a.name}</span>
              <span className="text-sm text-muted-foreground">{a.email}</span>
              <span className="mt-1 text-xs text-muted-foreground">Activation pending. No project data is visible yet.</span>
            </div>
            <ReissueButton membershipId={a.membershipId} />
          </li>
        ))}
      </ul>
    </section>
  )
}
