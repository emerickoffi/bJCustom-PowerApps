'use client'

import { useId, useOptimistic, useState, useTransition } from 'react'
import { ListChecks, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createTaskAction, setTaskCompletedAction } from '@/app/actions/tasks'
import { DashboardSectionHeader } from '@/components/dashboard/dashboard-section-header'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { formatTaskDue, TASK_PREVIEW_LIMIT, TASK_TITLE_MAX, taskUrgency, type StaffTask } from '@/lib/tasks'
import { cn } from '@/lib/utils'

export type TaskProjectOption = { id: string; name: string }

type Props = {
  open: StaffTask[]
  openCount: number
  completed: StaffTask[]
  projects: TaskProjectOption[]
  today: string
  unavailable?: boolean
}

type OptimisticChange = { id: string; completed: boolean }

function TaskRow({
  task,
  today,
  onToggle,
}: {
  task: StaffTask
  today: string
  onToggle: (task: StaffTask, completed: boolean) => void
}) {
  const id = useId()
  const done = task.completedAt !== null
  const urgency = taskUrgency(task.dueDate, today)
  return (
    <li className="flex items-start gap-3 py-2.5">
      <input
        id={id}
        type="checkbox"
        checked={done}
        onChange={(e) => onToggle(task, e.target.checked)}
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded accent-primary"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <label
          htmlFor={id}
          className={cn(
            'cursor-pointer text-sm font-medium leading-5 text-foreground text-pretty break-words',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </label>
        {(task.projectName || task.dueDate) && (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {task.dueDate && !done && (
              <span
                className={cn(
                  'tabular font-medium',
                  urgency === 'overdue' && 'text-destructive',
                  urgency === 'today' && 'text-foreground',
                )}
              >
                {formatTaskDue(task.dueDate, today)}
              </span>
            )}
            {task.projectName && <span className="truncate">{task.projectName}</span>}
          </p>
        )}
      </div>
    </li>
  )
}

function AddTaskDialog({
  open,
  onOpenChange,
  projects,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: TaskProjectOption[]
}) {
  const formId = useId()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    startTransition(async () => {
      const result = await createTaskAction({
        title: formData.get('title'),
        projectId: formData.get('projectId'),
        dueDate: formData.get('dueDate'),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Task added')
      onOpenChange(false)
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a to-do</DialogTitle>
          <DialogDescription>Assigned to you. Link a project and due date if it helps.</DialogDescription>
        </DialogHeader>
        <form id={formId} action={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-title`}>Task</Label>
            <Input
              id={`${formId}-title`}
              name="title"
              required
              maxLength={TASK_TITLE_MAX}
              autoComplete="off"
              placeholder="Call the tile supplier"
              aria-invalid={error ? true : undefined}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-project`}>Project (optional)</Label>
            <select
              id={`${formId}-project`}
              name="projectId"
              defaultValue=""
              className="h-9 w-full rounded-control border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${formId}-due`}>Due date (optional)</Label>
            <Input id={`${formId}-due`} name="dueDate" type="date" className="tabular" />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending}>
            {pending ? 'Adding…' : 'Add task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MyTodos({ open, openCount, completed, projects, today, unavailable = false }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [, startTransition] = useTransition()
  const [changes, applyChange] = useOptimistic<OptimisticChange[], OptimisticChange>([], (state, change) => [
    ...state.filter((c) => c.id !== change.id),
    change,
  ])

  const changeFor = (id: string) => changes.find((c) => c.id === id)
  const visibleOpen = open.filter((t) => changeFor(t.id)?.completed !== true)
  const reopened = completed.filter((t) => changeFor(t.id)?.completed === false)
  const visibleCompleted = completed.filter((t) => changeFor(t.id)?.completed !== false)
  const justCompleted = open.filter((t) => changeFor(t.id)?.completed === true)
  const count = Math.max(0, openCount - justCompleted.length + reopened.length)
  const drawerOpenList = [...visibleOpen, ...reopened.map((t) => ({ ...t, completedAt: null }))]
  const drawerCompletedList = [
    ...justCompleted.map((t) => ({ ...t, completedAt: new Date().toISOString() })),
    ...visibleCompleted,
  ]
  const preview = visibleOpen.slice(0, TASK_PREVIEW_LIMIT)

  function toggle(task: StaffTask, nextCompleted: boolean) {
    startTransition(async () => {
      applyChange({ id: task.id, completed: nextCompleted })
      const result = await setTaskCompletedAction(task.id, nextCompleted)
      if (!result.ok) toast.error(result.error)
    })
  }

  const addButton = (
    <Button size="sm" onClick={() => setAddOpen(true)} disabled={unavailable}>
      <Plus aria-hidden="true" />
      Add
    </Button>
  )

  return (
    <section aria-labelledby="my-todos-heading" className="surface flex flex-col gap-3 p-5">
      <DashboardSectionHeader
        id="my-todos-heading"
        title="My to-dos"
        icon={ListChecks}
        compact
        description={
          unavailable ? 'Tasks are unavailable right now.' : count === 0 ? 'Nothing open.' : `${count} open`
        }
        action={addButton}
      />

      {!unavailable && preview.length === 0 && (
        <p className="rounded-panel bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
          {"You're all caught up. Add a to-do to keep track of follow-ups."}
        </p>
      )}

      {preview.length > 0 && (
        <ul className="flex flex-col divide-y divide-border">
          {preview.map((task) => (
            <TaskRow key={task.id} task={task} today={today} onToggle={toggle} />
          ))}
        </ul>
      )}

      {!unavailable && (count > TASK_PREVIEW_LIMIT || completed.length > 0) && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setDrawerOpen(true)}>
          {count > TASK_PREVIEW_LIMIT ? `View all ${count}` : 'View all'}
        </Button>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full gap-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>My to-dos</SheetTitle>
            <SheetDescription>{count === 0 ? 'Nothing open.' : `${count} open, most urgent first.`}</SheetDescription>
          </SheetHeader>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="size-4 accent-primary"
              />
              Show completed
            </label>
            {addButton}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {drawerOpenList.length > 0 ? (
              <ul className="flex flex-col divide-y divide-border">
                {drawerOpenList.map((task) => (
                  <TaskRow key={task.id} task={task} today={today} onToggle={toggle} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No open to-dos.</p>
            )}
            {count > drawerOpenList.length && (
              <p className="pt-2 text-xs text-muted-foreground">Showing the first {drawerOpenList.length}.</p>
            )}
            {showCompleted && (
              <div className="mt-6 flex flex-col gap-1">
                <h3 className="type-meta text-muted-foreground">Recently completed</h3>
                {drawerCompletedList.length > 0 ? (
                  <ul className="flex flex-col divide-y divide-border">
                    {drawerCompletedList.map((task) => (
                      <TaskRow key={task.id} task={task} today={today} onToggle={toggle} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-sm text-muted-foreground">Nothing completed yet.</p>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AddTaskDialog open={addOpen} onOpenChange={setAddOpen} projects={projects} />
    </section>
  )
}
