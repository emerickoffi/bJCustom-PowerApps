'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { ChevronDown as ChevronDownIcon, UserCheck as UserCheckIcon, UserCog as UserCogIcon, UserX as UserXIcon } from 'lucide-react'
import { inviteStaffAction, revokeInvitationAction, updateMemberAction, updateMemberFormAction } from '@/app/actions/team'
import { ROLE_LABELS, STAFF_ROLES, type OrgRole } from '@/lib/domain'
import { formatDate, initials } from '@/lib/format'
import { initialActionState } from '@/lib/action-state'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { ActionButton, InlineActionForm } from '@/components/shared/inline-action'
import { NativeSelect, SelectField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

const ROLE_TONE: Record<OrgRole, SemanticTone> = {
  org_admin: 'success',
  project_manager: 'info',
  builder_staff: 'neutral',
  client: 'neutral',
}

function displayName(m: MemberRow) {
  return m.name ?? m.email ?? 'Team member'
}

export function MemberList({ members }: { members: MemberRow[] }) {
  return (
    <section aria-labelledby="members-heading" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="members-heading" className="font-serif text-lg font-semibold text-foreground">
          Members
        </h2>
        <span className="text-sm text-[#64756D]">{`${members.length} ${members.length === 1 ? 'person' : 'people'}`}</span>
      </div>
      <ul className="divide-y divide-[#E2E8E2]/80 overflow-hidden rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
        {members.map((m) => (
          <MemberItem key={m.id} member={m} />
        ))}
      </ul>
    </section>
  )
}

function MemberItem({ member: m }: { member: MemberRow }) {
  const [dialog, setDialog] = useState<'role' | 'access' | null>(null)
  const manageRef = useRef<HTMLButtonElement>(null)
  const name = displayName(m)
  const isActive = m.status === 'active'

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-[#F8F7F3]/70 sm:flex-nowrap sm:px-5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#EAF0E9] text-sm font-semibold text-[#174D32] ring-1 ring-inset ring-[#174D32]/12"
      >
        {initials(m.name ?? m.email)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-foreground">{name}</span>
          {m.isSelf && <SemanticBadge tone="neutral">You</SemanticBadge>}
          {!isActive && <SemanticBadge tone="danger">Suspended</SemanticBadge>}
        </span>
        {m.email && <span className="truncate text-sm text-[#64756D]">{m.email}</span>}
      </div>
      <div className="ml-14 flex shrink-0 items-center gap-2 sm:ml-0">
        <SemanticBadge tone={ROLE_TONE[m.role]}>{ROLE_LABELS[m.role]}</SemanticBadge>
        {m.isSelf ? (
          <span className="hidden text-xs text-[#64756D] md:inline" title="You cannot change your own role or access.">
            Your account
          </span>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                ref={manageRef}
                render={<Button variant="outline" size="sm" className="h-9 gap-1.5 px-3" />}
              >
                Manage
                <span className="sr-only">{` ${name}`}</span>
                <ChevronDownIcon aria-hidden="true" className="size-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setDialog('role')}>
                  <UserCogIcon aria-hidden="true" />
                  Change role
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isActive ? (
                  <DropdownMenuItem variant="destructive" onClick={() => setDialog('access')}>
                    <UserXIcon aria-hidden="true" />
                    Suspend account
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => setDialog('access')}>
                    <UserCheckIcon aria-hidden="true" />
                    Reactivate account
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={dialog === 'role'} onOpenChange={(open) => !open && setDialog(null)}>
              <DialogContent finalFocus={manageRef} className="gap-5 p-5 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-serif text-lg font-semibold">Change role</DialogTitle>
                  <DialogDescription>
                    {`${name} is currently ${ROLE_LABELS[m.role]}.`}
                  </DialogDescription>
                </DialogHeader>
                <ChangeRoleForm member={m} onDone={() => setDialog(null)} />
              </DialogContent>
            </Dialog>

            <Dialog open={dialog === 'access'} onOpenChange={(open) => !open && setDialog(null)}>
              <DialogContent finalFocus={manageRef} className="gap-5 p-5 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-serif text-lg font-semibold">
                    {isActive ? 'Suspend account' : 'Reactivate account'}
                  </DialogTitle>
                  <DialogDescription>
                    {isActive
                      ? `Suspend ${name}${m.email ? ` (${m.email})` : ''}? They will lose access immediately.`
                      : `Reactivate ${name}${m.email ? ` (${m.email})` : ''}? They will regain access immediately.`}
                  </DialogDescription>
                </DialogHeader>
                <AccessForm member={m} onDone={() => setDialog(null)} />
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </li>
  )
}

function ChangeRoleForm({ member, onDone }: { member: MemberRow; onDone: () => void }) {
  const [state, formAction] = useActionState(updateMemberFormAction, initialActionState)
  const [role, setRole] = useState<OrgRole>(member.role)

  useEffect(() => {
    if (state.success) {
      toast.success(`${displayName(member)} is now ${ROLE_LABELS[role]}.`)
      onDone()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="membership_id" value={member.id} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`role-${member.id}`} className="text-sm font-medium text-foreground">
          New role
        </label>
        <NativeSelect
          id={`role-${member.id}`}
          name="role"
          value={role}
          onChange={(e) => setRole(e.target.value as OrgRole)}
          className="h-10 w-full"
        >
          {roleOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {state.error && <FormMessage state={state} />}
      <DialogFooter className="-mx-5 -mb-5 border-t bg-[#F8F7F3] px-5 py-3">
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        {role === member.role ? (
          <Button type="button" disabled>
            Save changes
          </Button>
        ) : (
          <SubmitButton size="default" pendingLabel="Saving...">
            Save changes
          </SubmitButton>
        )}
      </DialogFooter>
    </form>
  )
}

function AccessForm({ member, onDone }: { member: MemberRow; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isActive = member.status === 'active'

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter className="-mx-5 -mb-5 border-t bg-[#F8F7F3] px-5 py-3">
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Cancel</DialogClose>
        <Button
          type="button"
          variant={isActive ? 'destructive' : 'default'}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              const result = await updateMemberAction(member.id, { status: isActive ? 'suspended' : 'active' })
              if (result.error) setError(result.error)
              else if (result.success) {
                toast.success(`${displayName(member)} ${isActive ? 'was suspended' : 'was reactivated'}.`)
                onDone()
              }
            })
          }
        >
          {pending ? 'Working...' : isActive ? 'Suspend account' : 'Reactivate account'}
        </Button>
      </DialogFooter>
    </div>
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
