import Link from 'next/link'
import { Circle, CircleCheck, CircleHelp, X } from 'lucide-react'
import { setSetupChecklistDismissed } from '@/app/actions/project-setup'
import type { SetupStep } from '@/lib/project-setup'
import { cn } from '@/lib/utils'

const STATE_ICON = { done: CircleCheck, todo: Circle, unknown: CircleHelp } as const
const STATE_LABEL = { done: 'Done', todo: 'Not done', unknown: 'Could not be checked' } as const

export function ProjectSetupChecklist({ projectId, steps, doneCount }: { projectId: string; steps: SetupStep[]; doneCount: number }) {
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
  return (
    <section aria-labelledby="setup-heading" className="surface flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="setup-heading" className="font-serif text-lg font-semibold text-foreground">
            Project setup
          </h2>
          <p className="text-xs text-muted-foreground">
            {`${doneCount} of ${steps.length} complete · Optional. You can keep working while setup is unfinished.`}
          </p>
        </div>
        <form action={setSetupChecklistDismissed}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="dismissed" value="true" />
          <button
            type="submit"
            className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[#F3F4F6] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" aria-hidden="true" />
            <span className="sr-only">Dismiss setup checklist</span>
          </button>
        </form>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]"
        role="progressbar"
        aria-label="Project setup"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
        {steps.map((step) => {
          const Icon = STATE_ICON[step.state]
          const done = step.state === 'done'
          return (
            <li key={step.key} className="flex min-h-11 items-center gap-3 rounded-lg px-1 py-1.5">
              <Icon
                className={cn('size-5 shrink-0', done ? 'text-primary' : step.state === 'unknown' ? 'text-warning' : 'text-muted-foreground/60')}
                aria-hidden="true"
              />
              <span className="sr-only">{`${STATE_LABEL[step.state]}:`}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={cn('text-sm font-medium', done ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground')}>
                  {step.label}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {step.state === 'unknown' ? 'Could not be checked. Refresh to try again.' : step.detail}
                </span>
              </span>
              {!done && (
                <Link
                  href={step.href}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {step.actionLabel}
                  <span className="sr-only">{`: ${step.label}`}</span>
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function ShowSetupChecklistButton({ projectId, remaining }: { projectId: string; remaining: number }) {
  return (
    <form action={setSetupChecklistDismissed}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="dismissed" value="false" />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {`Show setup checklist (${remaining} remaining)`}
      </button>
    </form>
  )
}
