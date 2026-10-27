'use client'

import { useActionState, useEffect, useState } from 'react'
import { Link2, X } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { NativeSelect, SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { ActionButton } from '@/components/shared/inline-action'
import { initialActionState } from '@/lib/action-state'
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

type StaffOption = { value: string; label: string }

function ProgressForm({
  projectId,
  activity,
  staffOptions,
  canManage,
}: {
  projectId: string
  activity: ScheduleActivity
  staffOptions: StaffOption[]
  canManage: boolean
}) {
  const [state, formAction] = useActionState(
    updateActivityProgressAction.bind(null, projectId, activity.id),
    initialActionState,
  )
  const [status, setStatus] = useState(activity.status)
  const v = state.values
  const err = state.fieldErrors ?? {}
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
            onChange={(e) => setStatus(e.target.value as ScheduleActivity['status'])}
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
          defaultValue={v?.percent_complete ?? String(Number(activity.percent_complete))}
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
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving..." className="w-full">
        Save progress
      </SubmitButton>
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

function PlanForm({ projectId, activity }: { projectId: string; activity: ScheduleActivity }) {
  const [state, formAction] = useActionState(updateActivityPlanAction.bind(null, projectId, activity.id), initialActionState)
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <PlanFields activity={activity} values={state.values} errors={state.fieldErrors ?? {}} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Saving..." variant="outline" className="w-full">
        Save plan
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
  onClose,
}: {
  projectId: string
  activity: ScheduleActivity | null
  activities: ScheduleActivity[]
  dependencies: ScheduleDependency[]
  staffOptions: StaffOption[]
  canManage: boolean
  onClose: () => void
}) {
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
                <ProgressForm key={activity.updated_at} projectId={projectId} activity={activity} staffOptions={staffOptions} canManage={canManage} />
              </section>
              {canManage && (
                <>
                  <section className="flex flex-col gap-3">
                    <SectionTitle>Plan</SectionTitle>
                    <PlanForm key={activity.updated_at} projectId={projectId} activity={activity} />
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
