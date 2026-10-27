'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { initialActionState } from '@/lib/action-state'
import { correctCompletionDateAction, enrollWarrantyAction, updateFollowupAction } from '@/app/actions/warranty'

function Message({ state }: { state: { error?: string; success?: string } }) {
  if (state.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  if (state.success) return <p role="status" className="text-sm text-primary">{state.success}</p>
  return null
}

function DateReasonFields({ fieldErrors, max }: { fieldErrors?: Record<string, string>; max: string }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="completion_date">Official completion date</Label>
        <Input id="completion_date" name="completion_date" type="date" max={max} required className="max-w-48" />
        {fieldErrors?.completion_date && <p className="text-xs text-destructive">{fieldErrors.completion_date}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" name="reason" required minLength={10} maxLength={2000} rows={2} />
        {fieldErrors?.reason && <p className="text-xs text-destructive">{fieldErrors.reason}</p>}
      </div>
    </>
  )
}

export function EnrollWarrantyForm({ projectId, needsDate, today }: { projectId: string; needsDate: boolean; today: string }) {
  const [state, action, pending] = useActionState(enrollWarrantyAction, initialActionState)
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="project_id" value={projectId} />
      {needsDate && (
        <p className="text-sm text-muted-foreground">
          This project was completed before warranty tracking existed. Enter its official completion date and how it was confirmed.
        </p>
      )}
      {needsDate && <DateReasonFields fieldErrors={state.fieldErrors} max={today} />}
      <Message state={state} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Starting...' : 'Start warranty'}
      </Button>
    </form>
  )
}

export function CorrectCompletionForm({ projectId, today }: { projectId: string; today: string }) {
  const [open, setOpen] = useState(false)
  const [state, action, pending] = useActionState(correctCompletionDateAction, initialActionState)
  if (!open) {
    return (
      <Button variant="outline" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        Correct completion date
      </Button>
    )
  }
  return (
    <form action={action} className="flex flex-col gap-4 rounded-lg border p-4">
      <input type="hidden" name="project_id" value={projectId} />
      <p className="text-sm text-muted-foreground">
        Milestones not yet reached are recalculated from the new date. The change is recorded in the project history.
      </p>
      <DateReasonFields fieldErrors={state.fieldErrors} max={today} />
      <Message state={state} />
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Saving...' : 'Save correction'}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  )
}

export function FollowupForm({
  taskId,
  projectId,
  status,
  today,
}: {
  taskId: string
  projectId: string
  status: 'todo' | 'prepared' | 'sent'
  today: string
}) {
  const [state, action, pending] = useActionState(updateFollowupAction, initialActionState)
  const [next, setNext] = useState<'todo' | 'prepared' | 'sent'>(status === 'todo' ? 'prepared' : 'sent')
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="project_id" value={projectId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`status-${taskId}`}>Mark as</Label>
        <select
          id={`status-${taskId}`}
          name="status"
          value={next}
          onChange={(e) => setNext(e.target.value as typeof next)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="todo">To do</option>
          <option value="prepared">Prepared</option>
          <option value="sent">Sent</option>
        </select>
      </div>
      {next === 'sent' && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`sent-${taskId}`}>Date sent</Label>
            <Input id={`sent-${taskId}`} name="sent_on" type="date" max={today} defaultValue={today} required className="w-44" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`method-${taskId}`}>Delivered by</Label>
            <select id={`method-${taskId}`} name="delivery_method" required className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="mail">Mail</option>
              <option value="hand_delivered">Hand delivered</option>
              <option value="email">Email</option>
              <option value="other">Other</option>
            </select>
          </div>
        </>
      )}
      <Button type="submit" size="sm" disabled={pending}>{pending ? 'Saving...' : 'Update'}</Button>
      <div className="basis-full"><Message state={state} /></div>
    </form>
  )
}
