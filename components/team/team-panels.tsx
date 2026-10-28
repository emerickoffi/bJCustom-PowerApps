'use client'

import { inviteStaffAction, revokeInvitationAction, updateMemberAction, updateMemberFormAction } from '@/app/actions/team'
import { ROLE_LABELS, STAFF_ROLES, type OrgRole } from '@/lib/domain'
import { formatDate, initials } from '@/lib/format'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { NativeSelect, SelectField, TextField } from '@/components/shared/form-field'
import { SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

export type MemberRow = {
  id: string
  role: OrgRole
  status: 'active' | 'suspended'
  name: string | null
  email: string | null
  isSelf: boolean
}

export type InvitationRow = {
  id: string
  email: string
  role: OrgRole
  created_at: string
  expires_at: string
}

const roleOptions = STAFF_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))

export function MemberList({ members }: { members: MemberRow[] }) {
  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-4">
      <h2 id="members-heading" className="font-serif text-lg font-semibold text-foreground">
        Members
      </h2>
      <ul className="divide-y divide-[#E2E8E2]/80 overflow-hidden rounded-xl border border-[#E2E8E2] bg-card">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-4 p-4 transition-colors hover:bg-[#F8F7F3]/70 md:flex-row md:items-center md:justify-between md:px-5"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EAF0E9] text-sm font-semibold text-[#174D32] ring-1 ring-inset ring-[#174D32]/12"
              >
                {initials(m.name ?? m.email)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex min-w-0 flex-wrap items-center gap-2 font-medium text-foreground">
                  <span className="truncate">{m.name ?? m.email ?? 'Team member'}</span>
                  {m.isSelf && <SemanticBadge tone="neutral">You</SemanticBadge>}
                  {m.status === 'suspended' && <SemanticBadge tone="danger">Suspended</SemanticBadge>}
                </span>
                <span className="truncate text-sm text-[#64756D]">{m.email}</span>
              </div>
            </div>
            {m.isSelf ? (
              <SemanticBadge tone="success" className="self-start md:self-auto">
                {ROLE_LABELS[m.role]}
              </SemanticBadge>
            ) : (
              <>
              <div className="flex items-center justify-between gap-3 md:hidden">
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <SemanticBadge tone="success">{ROLE_LABELS[m.role]}</SemanticBadge>
                  <span className="text-xs text-muted-foreground">{m.status === 'active' ? 'Active' : 'Suspended'}</span>
                </span>
                <Sheet>
                  <SheetTrigger render={<Button variant="outline" className="h-11 px-4" />}>
                    Manage
                    <span className="sr-only">{` ${m.name ?? m.email ?? 'member'}`}</span>
                  </SheetTrigger>
                  <SheetContent side="bottom" className="max-h-[85svh] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
                    <SheetHeader className="border-b px-5 py-4 pr-12">
                      <SheetTitle className="font-serif text-lg font-semibold">{m.name ?? m.email ?? 'Team member'}</SheetTitle>
                      <SheetDescription className="break-all">{m.email}</SheetDescription>
                    </SheetHeader>
                    <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
                      <InlineActionForm action={updateMemberFormAction} className="flex flex-col gap-3">
                        <input type="hidden" name="membership_id" value={m.id} />
                        <label htmlFor={`role-sheet-${m.id}`} className="text-sm font-medium text-foreground">
                          Role
                        </label>
                        <NativeSelect id={`role-sheet-${m.id}`} name="role" defaultValue={m.role} className="h-11 w-full">
                          {roleOptions.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </NativeSelect>
                        <SubmitButton size="lg" className="h-11" pendingLabel="Saving...">
                          Update role
                        </SubmitButton>
                      </InlineActionForm>
                      <div className="flex flex-col gap-2 border-t pt-5">
                        <span className="text-sm font-medium text-foreground">Account access</span>
                        <ActionButton
                          variant={m.status === 'active' ? 'destructive' : 'outline'}
                          size="lg"
                          label={m.status === 'active' ? 'Suspend member' : 'Reactivate member'}
                          confirmMessage={
                            m.status === 'active'
                              ? 'Suspend this member? They will lose access immediately.'
                              : 'Reactivate this member? They will regain access immediately.'
                          }
                          action={() => updateMemberAction(m.id, { status: m.status === 'active' ? 'suspended' : 'active' })}
                        />
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              <div className="hidden flex-wrap items-center gap-3 md:flex">
                <InlineActionForm
                  action={updateMemberFormAction}
                  className="flex items-center gap-1.5 rounded-lg border border-[#E2E8E2] bg-[#F8F7F3] p-1"
                >
                  <input type="hidden" name="membership_id" value={m.id} />
                  <label htmlFor={`role-${m.id}`} className="sr-only">
                    Role
                  </label>
                  <NativeSelect id={`role-${m.id}`} name="role" defaultValue={m.role} className="w-44 bg-card">
                    {roleOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </NativeSelect>
                  <SubmitButton variant="outline" size="default" pendingLabel="Saving...">
                    Update
                  </SubmitButton>
                </InlineActionForm>
                <ActionButton
                  variant="ghost"
                  size="default"
                  label={m.status === 'active' ? 'Suspend' : 'Reactivate'}
                  confirmMessage={
                    m.status === 'active' ? 'Suspend this member? They will lose access immediately.' : undefined
                  }
                  action={() => updateMemberAction(m.id, { status: m.status === 'active' ? 'suspended' : 'active' })}
                />
              </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
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
        {invitations.map((inv) => (
          <li key={inv.id} className="flex items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">{inv.email}</span>
              <span className="text-sm text-muted-foreground">
                {`${ROLE_LABELS[inv.role]} · expires ${formatDate(inv.expires_at)}`}
              </span>
            </div>
            <ActionButton
              label="Revoke"
              confirmMessage="Revoke this invitation?"
              action={() => revokeInvitationAction(inv.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function InviteStaffForm() {
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-lg font-semibold text-foreground">Invite staff</h2>
        <p className="text-sm text-muted-foreground">
          They join automatically after signing up and confirming this email address.
        </p>
      </div>
      <InlineActionForm action={inviteStaffAction} className="flex flex-col gap-4">
        <TextField name="email" label="Email" type="email" required autoComplete="off" />
        <SelectField name="role" label="Role" defaultValue="builder_staff" options={roleOptions} />
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
        <SubmitButton pendingLabel="Sending...">Send invitation</SubmitButton>
      </InlineActionForm>
    </section>
  )
}
