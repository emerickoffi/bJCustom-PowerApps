'use client'

import { useState } from 'react'
import Link from 'next/link'
import { HardHat, Repeat, UserPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/shared/form-message'
import { SelectField, TextAreaField } from '@/components/shared/form-field'
import { InlineActionForm } from '@/components/shared/inline-action'
import {
  assignSubcontractorAction,
  reassignSubcontractorAction,
  revokeAssignmentAction,
} from '@/app/actions/assignments'
import type { ActivityAssignment, AssignmentAvailability, CompanyOption } from '@/lib/assignments'
import { formatDate } from '@/lib/format'

function QualificationNotes({ companies }: { companies: CompanyOption[] }) {
  const flagged = companies.filter((c) => c.qualificationNote)
  if (!flagged.length) return null
  const blocking = flagged.some((c) => c.qualificationNote?.level === 'block')
  return (
    <p
      role="note"
      className={
        blocking
          ? 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800'
          : 'rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900'
      }
    >
      {blocking
        ? 'Your company requires qualification before new project work. Companies marked Blocked cannot be assigned until they are Qualified.'
        : `${flagged.length} ${flagged.length === 1 ? 'subcontractor is' : 'subcontractors are'} not fully qualified. You can still assign work; review their qualification first.`}
    </p>
  )
}

function CompanyFields({ companies, defaultCompany, defaultScope }: { companies: CompanyOption[]; defaultCompany?: string; defaultScope?: string }) {
  return (
    <>
      <SelectField
        name="subcontractor_company_id"
        label="Subcontractor"
        required
        placeholder="Choose an active subcontractor"
        defaultValue={defaultCompany}
        options={companies.map((c) => ({
          value: c.value,
          label: c.qualificationNote
            ? `${c.label} · ${c.trade} · ${c.qualificationNote.level === 'block' ? 'Blocked: ' : ''}${c.qualificationNote.short}`
            : `${c.label} · ${c.trade}`,
        }))}
      />
      <QualificationNotes companies={companies} />
      <TextAreaField
        name="scope_of_work"
        label="Scope of work"
        required
        rows={3}
        maxLength={2000}
        defaultValue={defaultScope}
        hint="What this company is responsible for on this activity."
      />
    </>
  )
}

function AssignmentRow({
  projectId,
  assignment,
  companies,
  canReassign,
}: {
  projectId: string
  assignment: ActivityAssignment
  companies: CompanyOption[]
  canReassign: boolean
}) {
  const [mode, setMode] = useState<'view' | 'reassign' | 'revoke'>('view')
  const close = () => setMode('view')
  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{assignment.company_name}</span>
          <span className="text-xs text-muted-foreground">
            {[assignment.company_trade, `Assigned ${formatDate(assignment.created_at)}`, assignment.company_status === 'inactive' ? 'Company now inactive' : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        {mode === 'view' && (
          <div className="flex shrink-0 gap-1">
            {canReassign && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode('reassign')}>
                <Repeat data-icon="inline-start" />
                Reassign
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setMode('revoke')} className="text-destructive hover:text-destructive">
              Revoke
            </Button>
          </div>
        )}
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{assignment.scope_of_work}</p>

      {mode === 'reassign' && (
        <InlineActionForm
          action={reassignSubcontractorAction.bind(null, projectId, assignment.id)}
          onSuccess={close}
          className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3"
        >
          <CompanyFields companies={companies} defaultScope={assignment.scope_of_work} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close} className="flex-1">
              Cancel
            </Button>
            <SubmitButton size="default" pendingLabel="Saving..." className="flex-1">
              Save reassignment
            </SubmitButton>
          </div>
        </InlineActionForm>
      )}

      {mode === 'revoke' && (
        <InlineActionForm
          action={revokeAssignmentAction.bind(null, projectId, assignment.id)}
          onSuccess={close}
          className="flex flex-col gap-3 rounded-lg bg-destructive/5 p-3"
        >
          <TextAreaField name="revoke_reason" label="Reason (optional)" rows={2} maxLength={500} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={close} className="flex-1">
              Cancel
            </Button>
            <SubmitButton size="default" variant="destructive" pendingLabel="Revoking..." className="flex-1">
              Revoke assignment
            </SubmitButton>
          </div>
        </InlineActionForm>
      )}
    </li>
  )
}

export function ActivityAssignments({
  projectId,
  activityId,
  availability,
  assignments,
  companies,
  acceptsNew,
}: {
  projectId: string
  activityId: string
  availability: AssignmentAvailability
  assignments: ActivityAssignment[]
  companies: CompanyOption[]
  acceptsNew: boolean
}) {
  const [adding, setAdding] = useState(false)

  if (availability === 'setup-required') {
    return (
      <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
        Subcontractor assignments are not set up yet. An administrator needs to apply the assignments database migration.
      </p>
    )
  }
  if (availability === 'error') {
    return <p className="text-sm text-muted-foreground">Assignments could not be loaded. Refresh the page to try again.</p>
  }

  const assignedIds = new Set(assignments.map((a) => a.subcontractor_company_id))
  const available = companies.filter((c) => !assignedIds.has(c.value))

  return (
    <div className="flex flex-col gap-3">
      {assignments.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {assignments.map((a) => (
            <AssignmentRow key={a.id} projectId={projectId} assignment={a} companies={companies} canReassign={acceptsNew} />
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <HardHat className="size-4 shrink-0" aria-hidden="true" />
          No subcontractor is assigned to this activity.
        </p>
      )}

      {!acceptsNew ? (
        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          New subcontractor work can only be assigned while the project is in preconstruction, construction, or closeout.
          Existing assignments stay here as history.
        </p>
      ) : companies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {'No active subcontractors yet. '}
          <Link href="/subcontractors/new" className="font-medium text-primary underline-offset-4 hover:underline">
            Add one to the directory
          </Link>
          {' to assign work.'}
        </p>
      ) : adding ? (
        <InlineActionForm
          action={assignSubcontractorAction.bind(null, projectId, activityId)}
          onSuccess={() => setAdding(false)}
          className="flex flex-col gap-3 rounded-lg border p-3"
        >
          <CompanyFields companies={available.length ? available : companies} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAdding(false)} className="flex-1">
              <X data-icon="inline-start" />
              Cancel
            </Button>
            <SubmitButton size="default" pendingLabel="Assigning..." className="flex-1">
              Assign work
            </SubmitButton>
          </div>
        </InlineActionForm>
      ) : (
        <Button type="button" variant="outline" onClick={() => setAdding(true)} className="w-full sm:w-fit">
          <UserPlus data-icon="inline-start" />
          Assign subcontractor
        </Button>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Assignments never change activity progress or completion. Subcontractors do not get app access.
      </p>
    </div>
  )
}
