'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { CheckCircle2, Link2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { NativeSelect, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { ActionButton } from '@/components/shared/inline-action'
import { initialActionState, type ActionState } from '@/lib/action-state'
import {
  addDependencyAction,
  deleteActivityAction,
  removeDependencyAction,
  updateActivityPlanAction,
  updateActivityProgressAction,
  createActivityAction,
} from '@/app/actions/schedule'
import {
  ACTIVITY_STATUSES,
  ACTIVITY_STATUS_LABELS,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  type ScheduleActivity,
  type ScheduleDependency,
} from '@/lib/schedule'
import { formatDate } from '@/lib/format'
import { ActivityAssignments } from '@/components/schedule/activity-assignments'
import type { ActivityAssignment, AssignmentAvailability, CompanyOption } from '@/lib/assignments'

export type AssignmentProps = {
  availability: AssignmentAvailability
  byActivity: Map<string, ActivityAssignment[]>
  companies: CompanyOption[]
  acceptsNew: boolean
}

type StaffOption = { value: string; label: string }

type SavedNotice = (message: string) => void

function MarkCompleteButton({ onMarkComplete }: { onMarkComplete: (formData: FormData) => void }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" size="lg" disabled={pending} formAction={onMarkComplete} className="w-full">
      <CheckCircle2 data-icon="inline-start" />
      {pending ? 'Saving...' : 'Mark Complete'}
    </Button>
  )
}

function SavedMessage({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="status" className="flex items-start gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

function ProgressForm({
  projectId,
  activity,
  staffOptions,
  canManage,
  onSaved,
}: {
  projectId: string
  activity: ScheduleActivity
  staffOptions: StaffOption[]
  canManage: boolean
  onSaved: SavedNotice
}) {
  // The form remounts when the saved activity refreshes, so success is reported to the parent to stay visible.
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateActivityProgressAction(projectId, activity.id, prev, formData)
    if (result.success) onSaved(result.success)
    return result
  }, initialActionState)
  const v = state.values
  const [status, setStatus] = useState<ScheduleActivity['status']>(
    (v?.status as ScheduleActivity['status'] | undefined) ?? activity.status,
  )
  const [percent, setPercent] = useState(v?.percent_complete ?? String(Number(activity.percent_complete)))
  const err = state.fieldErrors ?? {}
  const isComplete = activity.status === 'completed'

  const markComplete = (formData: FormData) => {
    formData.set('status', 'completed')
    formData.set('percent_complete', '100')
    if (!formData.get('actual_end') && activity.actual_end) formData.set('actual_end', activity.actual_end)
    formAction(formData)
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="status" className="text-sm font-medium text-foreground">
            Status
          </label>
          <NativeSelect
            id="status"
            name="status"
            value={status}
            onChange={(e) => {
              const next = e.target.value as ScheduleActivity['status']
              setStatus(next)
              if (next === 'completed') setPercent('100')
            }}
          >
            {ACTIVITY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ACTIVITY_STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <TextField
          name="percent_complete"
          label="Percent complete"
          type="number"
          min={0}
          max={100}
          step={1}
          inputMode="numeric"
          value={percent}
          onChange={(e) => setPercent(e.currentTarget.value)}
          error={err.percent_complete}
          hint="100% marks the activity complete."
        />
        <TextField
          name="actual_start"
          label="Actual start"
          type="date"
          defaultValue={v?.actual_start ?? activity.actual_start ?? ''}
          error={err.actual_start}
        />
        <TextField
          name="actual_end"
          label="Actual finish"
          type="date"
          disabled={status !== 'completed' && status !== 'skipped'}
          defaultValue={v?.actual_end ?? activity.actual_end ?? ''}
          error={err.actual_end}
          hint={status === 'completed' ? 'Defaults to today.' : 'Set when the activity is completed.'}
        />
      </div>
      {canManage ? (
        <SelectField
          name="assigned_to"
          label="Assigned to"
          placeholder="Unassigned"
          defaultValue={v?.assigned_to ?? activity.assigned_to ?? ''}
          options={staffOptions}
        />
      ) : (
        <input type="hidden" name="assigned_to" value={activity.assigned_to ?? ''} />
      )}
      <TextAreaField
        name="delay_reason"
        label="Delay reason"
        required={status === 'delayed'}
        rows={2}
        maxLength={2000}
        defaultValue={v?.delay_reason ?? activity.delay_reason ?? ''}
        error={err.delay_reason}
        hint="Internal. Publish a homeowner-friendly explanation below if appropriate."
      />
      <TextAreaField
        name="public_note"
        label="Homeowner update"
        rows={2}
        maxLength={1000}
        defaultValue={v?.public_note ?? activity.public_note ?? ''}
        hint="Shown on the homeowner timeline when this activity is published."
      />
      <TextAreaField
        name="internal_notes"
        label="Internal notes"
        rows={3}
        maxLength={5000}
        defaultValue={v?.internal_notes ?? activity.internal_notes ?? ''}
        hint="Staff only. Never shown to the homeowner."
      />
      <FormMessage state={state.success ? initialActionState : state} />
      <div className="flex flex-col gap-2 sm:flex-row">
        {!isComplete && <MarkCompleteButton onMarkComplete={markComplete} />}
        <SubmitButton pendingLabel="Saving..." className="w-full sm:flex-1">
          Save Progress
        </SubmitButton>
      </div>
      {!isComplete && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Mark Complete sets the status to Completed at 100% and keeps any finish date already recorded.
        </p>
      )}
    </form>
  )
}

function PlanFields({ activity, values, errors }: { activity?: ScheduleActivity; values?: Record<string, string>; errors: Record<string, string> }) {
  return (
    <>
      <TextField name="name" label="Activity name" required maxLength={160} defaultValue={values?.name ?? activity?.name ?? ''} error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="phase" label="Phase" required maxLength={80} defaultValue={values?.phase ?? activity?.phase ?? ''} error={errors.phase} />
        <SelectField
          name="activity_type"
          label="Type"
          required
          defaultValue={values?.activity_type ?? activity?.activity_type ?? 'task'}
          options={ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_TYPE_LABELS[t] }))}
        />
        <TextField
          name="planned_start"
          label="Planned start"
          type="date"
          defaultValue={values?.planned_start ?? activity?.planned_start ?? ''}
          error={errors.planned_start}
        />
        <TextField
          name="planned_end"
          label="Planned finish"
          type="date"
          defaultValue={values?.planned_end ?? activity?.planned_end ?? ''}
          error={errors.planned_end}
        />
        <TextField
          name="weight"
          label="Progress weight"
          type="number"
          min={0}
          max={1000}
          step="0.5"
          defaultValue={values?.weight ?? String(activity ? Number(activity.weight) : 1)}
          error={errors.weight}
          hint="Share of overall project completion."
        />
        <TextField
          name="sort_order"
          label="Order"
          type="number"
          min={0}
          step={1}
          defaultValue={values?.sort_order ?? String(activity?.sort_order ?? 1000)}
          error={errors.sort_order}
        />
      </div>
      <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={values ? values.is_published === 'on' : (activity?.is_published ?? true)}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">Show on homeowner timeline</span>
          <span className="text-xs text-muted-foreground">Name, dates, status, and the homeowner update only.</span>
        </span>
      </label>
    </>
  )
}

function PlanForm({ projectId, activity, onSaved }: { projectId: string; activity: ScheduleActivity; onSaved: SavedNotice }) {
  const [state, formAction] = useActionState(async (prev: ActionState, formData: FormData) => {
    const result = await updateActivityPlanAction(projectId, activity.id, prev, formData)
    if (result.success) onSaved(result.success)
    return result
  }, initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <PlanFields activity={activity} values={state.values} errors={state.fieldErrors ?? {}} />
      <FormMessage state={state.success ? initialActionState : state} />
      <SubmitButton pendingLabel="Saving..." variant="outline" className="w-full">
        Save Plan
      </SubmitButton>
    </form>
  )
}

function DependencyEditor({
  projectId,
  activity,
  activities,
  dependencies,
}: {
  projectId: string
  activity: ScheduleActivity
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
}) {
  const [state, formAction] = useActionState(addDependencyAction.bind(null, projectId, activity.id), initialActionState)
  const byId = new Map(activities.map((a) => [a.id, a]))
  const preds = dependencies.filter((d) => d.successor_id === activity.id)
  const existing = new Set(preds.map((d) => d.predecessor_id))
  const options = activities.filter((a) => a.id !== activity.id && !existing.has(a.id))
  return (
    <div className="flex flex-col gap-3">
      {preds.length ? (
        <ul className="flex flex-col divide-y rounded-lg border">
          {preds.map((d) => {
            const p = byId.get(d.predecessor_id)
            return (
              <li key={d.id} className="flex items-center justify-between gap-2 p-2 pl-3 text-sm">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-foreground">{p?.name ?? 'Removed activity'}</span>
                  <span className="text-xs text-muted-foreground">{`Finishes ${formatDate(p?.planned_end)}`}</span>
                </span>
                <ActionButton action={removeDependencyAction.bind(null, projectId, d.id)} label="Remove" pendingLabel="..." />
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No predecessors. This activity can start independently.</p>
      )}
      {options.length > 0 && (
        <form action={formAction} className="flex flex-col gap-2">
          <label htmlFor="predecessor_id" className="text-sm font-medium text-foreground">
            Must start after
          </label>
          <div className="flex gap-2">
            <NativeSelect id="predecessor_id" name="predecessor_id" defaultValue="" required>
              <option value="" disabled>
                Choose an activity
              </option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            <SubmitButton size="default" variant="outline" pendingLabel="Adding...">
              <Link2 data-icon="inline-start" />
              Add
            </SubmitButton>
          </div>
          <FormMessage state={state} />
        </form>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</h3>
}

export function ActivityEditor({
  projectId,
  activity,
  activities,
  dependencies,
  staffOptions,
  canManage,
  assignments,
  onClose,
}: {
  projectId: string
  activity: ScheduleActivity | null
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  staffOptions: StaffOption[]
  canManage: boolean
  assignments?: AssignmentProps
  onClose: () => void
}) {
  const [notice, setNotice] = useState<{ activityId: string; section: 'progress' | 'plan'; message: string } | null>(null)
  const noticeFor = (section: 'progress' | 'plan') =>
    notice && activity && notice.activityId === activity.id && notice.section === section ? notice.message : null
  return (
    <Sheet open={!!activity} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        {activity && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="font-serif text-xl">{activity.name}</SheetTitle>
              <SheetDescription>{`${activity.phase} · ${ACTIVITY_TYPE_LABELS[activity.activity_type]}`}</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-8 px-4 pb-8">
              <section className="flex flex-col gap-3">
                <SectionTitle>Progress</SectionTitle>
                <ProgressForm
                  key={activity.updated_at}
                  projectId={projectId}
                  activity={activity}
                  staffOptions={staffOptions}
                  canManage={canManage}
                  onSaved={(message) => setNotice({ activityId: activity.id, section: 'progress', message })}
                />
                <SavedMessage message={noticeFor('progress')} />
              </section>
              {canManage && assignments && assignments.availability !== 'off' && (
                <section className="flex flex-col gap-3">
                  <SectionTitle>Subcontractors</SectionTitle>
                  <ActivityAssignments
                    projectId={projectId}
                    activityId={activity.id}
                    availability={assignments.availability}
                    assignments={assignments.byActivity.get(activity.id) ?? []}
                    companies={assignments.companies}
                    acceptsNew={assignments.acceptsNew}
                  />
                </section>
              )}
              {canManage && (
                <>
                  <section className="flex flex-col gap-3">
                    <SectionTitle>Plan</SectionTitle>
                    <PlanForm
                      key={activity.updated_at}
                      projectId={projectId}
                      activity={activity}
                      onSaved={(message) => setNotice({ activityId: activity.id, section: 'plan', message })}
                    />
                    <SavedMessage message={noticeFor('plan')} />
                  </section>
                  <section className="flex flex-col gap-3">
                    <SectionTitle>Dependencies</SectionTitle>
                    <DependencyEditor projectId={projectId} activity={activity} activities={activities} dependencies={dependencies} />
                  </section>
                  <section className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 p-3">
                    <p className="text-sm text-muted-foreground">Removing an activity also removes its dependencies. History is kept.</p>
                    <ActionButton
                      action={async () => {
                        const res = await deleteActivityAction(projectId, activity.id)
                        if (res.success) onClose()
                        return res
                      }}
                      label="Remove"
                      pendingLabel="Removing..."
                      variant="destructive"
                      confirmMessage={`Remove "${activity.name}" from the schedule?`}
                    />
                  </section>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function NewActivitySheet({ projectId, open, onClose }: { projectId: string; open: boolean; onClose: () => void }) {
  const [state, formAction] = useActionState(createActivityAction.bind(null, projectId), initialActionState)
  useEffect(() => {
    if (state.success) onClose()
  }, [state, onClose])
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="font-serif text-xl">New activity</SheetTitle>
          <SheetDescription>Add a task, milestone, inspection, or meeting to this schedule.</SheetDescription>
        </SheetHeader>
        <form action={formAction} className="flex flex-col gap-4 px-4 pb-8">
          <PlanFields values={state.values} errors={state.fieldErrors ?? {}} />
          <FormMessage state={state} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              <X data-icon="inline-start" />
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding..." className="flex-1">
              Add activity
            </SubmitButton>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
