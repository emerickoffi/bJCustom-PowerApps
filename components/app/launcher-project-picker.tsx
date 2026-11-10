'use client'

import { useDeferredValue, useState } from 'react'
import useSWR from 'swr'
import { ArrowRight, Loader2, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { searchJobsAction } from '@/app/actions/job-context'
import type { JobSummary } from '@/lib/job-context'

/**
 * Asks which project a launcher shortcut is for. Uses the header project search (RLS-scoped, same workspace),
 * so only projects the person can open are listed. Closing it cancels the pending shortcut.
 */
export function LauncherProjectPicker({
  actionLabel,
  onPick,
  onCancel,
}: {
  /** The shortcut waiting for a project; null keeps the picker closed. */
  actionLabel: string | null
  onPick: (job: JobSummary) => void
  onCancel: () => void
}) {
  return (
    <Dialog open={actionLabel !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="flex max-h-[min(80dvh,36rem)] flex-col gap-4 sm:max-w-lg">
        {actionLabel !== null && <PickerBody actionLabel={actionLabel} onPick={onPick} />}
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({ actionLabel, onPick }: { actionLabel: string; onPick: (job: JobSummary) => void }) {
  const [q, setQ] = useState('')
  const query = useDeferredValue(q.trim())
  const { data, isLoading } = useSWR(['launcher-project-picker', query], ([, term]) => searchJobsAction(term), {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })
  const jobs = data ?? []

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose a project</DialogTitle>
        <DialogDescription>
          <span className="font-medium text-foreground">{actionLabel}</span> continues on the project you choose.
        </DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="launcher-project-search" className="sr-only">
          Search projects
        </label>
        <Input
          id="launcher-project-search"
          type="search"
          autoFocus
          placeholder="Search name or number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-11 pl-9"
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {isLoading ? 'Searching projects' : `${jobs.length} project${jobs.length === 1 ? '' : 's'} found`}
      </p>
      {isLoading && jobs.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading projects
        </p>
      ) : jobs.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {query ? <>No projects match &ldquo;{query}&rdquo;.</> : 'No projects available.'}
        </p>
      ) : (
        <ul className="-mx-2 flex min-h-0 flex-col overflow-y-auto" aria-label="Projects">
          {jobs.map((job) => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => onPick(job)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-sage/60 focus-visible:bg-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{job.name}</span>
                  {(job.projectNumber || job.city) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {[job.projectNumber, job.city].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
