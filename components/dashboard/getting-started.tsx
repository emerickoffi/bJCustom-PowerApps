'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, X } from 'lucide-react'
import { toast } from 'sonner'
import { dismissGettingStartedAction, loadSampleProjectAction, removeSampleProjectAction } from '@/app/actions/getting-started'
import { Button } from '@/components/ui/button'
import type { Checklist } from '@/lib/getting-started-shared'
import { cn } from '@/lib/utils'

/** Dashboard checklist for company administrators during their first weeks. */
export function GettingStarted({ checklist }: { checklist: Checklist }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const sample = checklist.steps.find((s) => s.id === 'sample')
  const total = checklist.steps.length
  const percent = Math.round((checklist.doneCount / total) * 100)

  function run(action: () => Promise<{ error?: string; success?: string; projectId?: string }>, openProject = false) {
    startTransition(async () => {
      const result = await action()
      if (result.error) {
        toast.error(result.error)
        return
      }
      if (result.success) toast.success(result.success)
      if (openProject && result.projectId) router.push(`/projects/${result.projectId}`)
      else router.refresh()
    })
  }

  return (
    <section aria-labelledby="getting-started-heading" className="rounded-surface bg-card p-4 ring-1 ring-border sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="getting-started-heading" className="text-base font-semibold text-foreground">
            Getting started
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{`${checklist.doneCount} of ${total} done. A few steps to set Trefort up for your company.`}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Hide the getting started checklist"
          disabled={pending}
          onClick={() => run(dismissGettingStartedAction)}
          className="-mr-2 -mt-1 shrink-0"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-4 flex flex-col divide-y">
        {checklist.steps.map((step) => (
          <li key={step.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className={cn('text-sm font-medium', step.done ? 'text-muted-foreground line-through' : 'text-foreground')}>
                  {step.title}
                  <span className="sr-only">{step.done ? ' (done)' : ' (to do)'}</span>
                </p>
                {!step.done && <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>}
              </div>
            </div>
            <div className="flex shrink-0 gap-2 pl-8 sm:pl-0">
              {step.href ? (
                <Button variant={step.done ? 'ghost' : 'outline'} size="sm" render={<Link href={step.href} />} nativeButton={false}>
                  {step.cta}
                </Button>
              ) : step.id === 'sample' ? (
                <Button type="button" size="sm" disabled={pending} onClick={() => run(loadSampleProjectAction, true)}>
                  {pending ? 'Adding...' : step.cta}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      {sample?.href && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm text-muted-foreground">
          <span>The sample project uses example data and never contacts anyone.</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(loadSampleProjectAction)}
            className="font-medium text-link underline-offset-4 hover:underline disabled:opacity-60"
          >
            Fill in newly enabled modules
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(removeSampleProjectAction)}
            className="font-medium text-link underline-offset-4 hover:underline disabled:opacity-60"
          >
            Archive sample project
          </button>
        </div>
      )}
    </section>
  )
}
