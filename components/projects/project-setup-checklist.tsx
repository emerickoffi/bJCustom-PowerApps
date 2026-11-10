import Link from 'next/link'
import { Circle, CircleCheck, CircleHelp, Settings2 } from 'lucide-react'
import { setSetupChecklistDismissed } from '@/app/actions/project-setup'
import type { SetupStep } from '@/lib/project-setup'
import { cn } from '@/lib/utils'

const STATE_ICON = { done: CircleCheck, todo: Circle, unknown: CircleHelp } as const
const STATE_LABEL = { done: 'Done', todo: 'Not done', unknown: 'Could not be checked' } as const

/** Collapsed to one line by default so setup never pushes current work down the page. */
export function ProjectSetupChecklist({ projectId, steps, doneCount }: { projectId: string; steps: SetupStep[]; doneCount: number }) {
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0
  return (
    <details className="surface group">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-champagne-soft text-warning">
          <Settings2 className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-foreground">{`Project setup: ${doneCount} of ${steps.length} complete`}</span>
        <span aria-hidden="true" className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-[#F3F4F6] sm:block">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </span>
        <span className="ml-auto text-sm font-medium text-primary">
          <span className="group-open:hidden">Show steps</span>
          <span className="hidden group-open:inline">Hide steps</span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t px-4 pb-4 pt-3">
        <p className="text-xs text-muted-foreground">Optional. You can keep working while setup is unfinished.</p>
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
        <form action={setSetupChecklistDismissed} className="self-start">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="dismissed" value="true" />
          <button
            type="submit"
            className="inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Hide setup from Overview
          </button>
        </form>
      </div>
    </details>
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
