'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { UserCog, Users } from 'lucide-react'
import { addProjectMemberAction, removeProjectMemberAction } from '@/app/actions/projects'
import { Avatar, MEMBER_ROLE_LABELS, Panel, type ProjectMemberRow } from '@/components/projects/project-people'
import { ActionButton } from '@/components/shared/inline-action'
import { NativeSelect } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { initialActionState } from '@/lib/action-state'

type Option = { value: string; label: string }

const SUMMARY_MEMBER_LIMIT = 3
const DEFAULT_ROLE = 'staff'
const DISCARD_MESSAGE = 'Discard the team member you started adding?'

function roleLabel(role: string) {
  return MEMBER_ROLE_LABELS[role] ?? role
}

function ManagerAvatar({ name }: { name: string | null }) {
  if (name) return <Avatar name={name} tone="primary" />
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/40 text-primary">
      <UserCog className="size-4" aria-hidden="true" />
    </span>
  )
}

function ManagerRow({ name, membershipRole }: { name: string | null; membershipRole: string | null }) {
  return (
    <div className="flex items-center gap-3">
      <ManagerAvatar name={name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-wide text-primary">Project manager</span>
        <span className="truncate font-medium text-foreground">{name ?? 'Unassigned'}</span>
        {membershipRole && membershipRole !== 'project_manager' && (
          <span className="text-xs text-muted-foreground">{`Project role: ${roleLabel(membershipRole)}`}</span>
        )}
      </div>
    </div>
  )
}

function AddMemberForm({
  projectId,
  available,
  onDirtyChange,
}: {
  projectId: string
  available: Option[]
  onDirtyChange: (dirty: boolean) => void
}) {
  const [state, formAction] = useActionState(addProjectMemberAction.bind(null, projectId), initialActionState)
  // Controlled so a failed save keeps the selection instead of React's post-action form reset clearing it.
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState(DEFAULT_ROLE)
  const personId = useId()
  const roleId = useId()

  useEffect(() => {
    if (!state.success) return
    setUserId('')
    setRole(DEFAULT_ROLE)
  }, [state])

  useEffect(() => {
    onDirtyChange(userId !== '' || role !== DEFAULT_ROLE)
  }, [userId, role, onDirtyChange])

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={personId}>Person</Label>
        <NativeSelect id={personId} name="user_id" required value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="" disabled>
            Select a person
          </option>
          {available.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={roleId}>Project role</Label>
        <NativeSelect id={roleId} name="project_role" value={role} onChange={(e) => setRole(e.target.value)}>
          {Object.entries(MEMBER_ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <SubmitButton variant="outline" size="default" pendingLabel="Adding...">
        Add to team
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  )
}

export function ProjectTeamPanel({
  projectId,
  projectName,
  managerId,
  managerName,
  members,
  staffOptions,
  canEdit,
}: {
  projectId: string
  projectName: string
  managerId: string | null
  managerName: string | null
  members: ProjectMemberRow[]
  staffOptions: Option[]
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [dirty, setDirty] = useState(false)
  const openerRef = useRef<HTMLButtonElement | null>(null)

  // Matched by user id: the manager's own membership row (if any) is folded into the manager entry.
  const managerMembership = managerId ? (members.find((m) => m.user_id === managerId) ?? null) : null
  const others = members.filter((m) => m.user_id !== managerId)
  const visibleOthers = others.slice(0, SUMMARY_MEMBER_LIMIT)
  const totalPeople = (managerId ? 1 : 0) + others.length
  const assigned = new Set(members.map((m) => m.user_id))
  const available = staffOptions.filter((o) => !assigned.has(o.value))

  const openFrom = (button: HTMLButtonElement) => {
    openerRef.current = button
    setOpen(true)
  }

  const confirmDiscard = () => !dirty || window.confirm(DISCARD_MESSAGE)

  return (
    <Panel
      title="Builder team"
      action={
        canEdit ? (
          <Button variant="outline" size="sm" onClick={(e) => openFrom(e.currentTarget)}>
            <Users className="size-3.5" aria-hidden="true" />
            Manage team
          </Button>
        ) : undefined
      }
    >
      <div className="rounded-lg border border-[#D5E2D3] bg-interactive-soft/60 p-3">
        <ManagerRow name={managerName} membershipRole={managerMembership?.project_role ?? null} />
      </div>
      {others.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visibleOthers.map((member) => (
            <li key={member.id} className="flex items-center gap-3">
              <Avatar name={member.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-foreground">{member.name}</span>
                <span className="text-xs text-muted-foreground">{roleLabel(member.project_role)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No other team members assigned.</p>
      )}
      {others.length > SUMMARY_MEMBER_LIMIT && (
        <Button variant="ghost" size="sm" className="self-start text-primary" onClick={(e) => openFrom(e.currentTarget)}>
          {`View all (${totalPeople})`}
        </Button>
      )}

      <Sheet
        open={open}
        onOpenChange={(next, details) => {
          if (!next && !confirmDiscard()) {
            details.cancel()
            return
          }
          if (!next) setDirty(false)
          setOpen(next)
        }}
      >
        <SheetContent
          finalFocus={openerRef}
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="gap-1 border-b p-4 pr-12">
            <SheetTitle className="font-serif text-xl font-semibold text-foreground">
              {canEdit ? 'Manage team' : 'Project team'}
            </SheetTitle>
            <SheetDescription>{projectName}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4">
            <section aria-labelledby="team-manager-heading" className="flex flex-col gap-3">
              <h3 id="team-manager-heading" className="text-sm font-semibold text-foreground">
                Project manager
              </h3>
              <div className="flex flex-col gap-3 rounded-lg border border-[#D5E2D3] bg-interactive-soft/60 p-3">
                <ManagerRow name={managerName} membershipRole={null} />
                {canEdit && (
                  <Link
                    href={`/projects/${projectId}/edit`}
                    onClick={(e) => {
                      if (!confirmDiscard()) e.preventDefault()
                    }}
                    className="inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-interactive-soft"
                  >
                    <UserCog className="size-3.5" aria-hidden="true" />
                    {managerName ? 'Change project manager' : 'Assign project manager'}
                  </Link>
                )}
              </div>
            </section>

            <section aria-labelledby="team-members-heading" className="flex flex-col gap-3">
              <h3 id="team-members-heading" className="text-sm font-semibold text-foreground">
                {`Team members (${members.length})`}
              </h3>
              {members.length > 0 ? (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {members.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 p-3">
                      <Avatar name={member.name} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium text-foreground">{member.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {roleLabel(member.project_role)}
                          {member.user_id === managerId && ' · Assigned project manager'}
                        </span>
                      </div>
                      {canEdit && (
                        <ActionButton
                          label="Remove"
                          pendingLabel="Removing..."
                          confirmMessage="Remove this person from the project?"
                          action={() => removeProjectMemberAction(projectId, member.id)}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No team members assigned.</p>
              )}
            </section>

            {canEdit && (
              <section aria-labelledby="team-add-heading" className="flex flex-col gap-3 border-t pt-6">
                <h3 id="team-add-heading" className="text-sm font-semibold text-foreground">
                  Add team member
                </h3>
                {available.length > 0 ? (
                  <AddMemberForm projectId={projectId} available={available} onDirtyChange={setDirty} />
                ) : (
                  <p className="text-sm text-muted-foreground">Everyone available is already on this project.</p>
                )}
              </section>
            )}
          </div>

          <SheetFooter className="border-t">
            <SheetClose render={<Button variant="outline" />}>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </Panel>
  )
}
