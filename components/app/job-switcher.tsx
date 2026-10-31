'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Check, ChevronsUpDown, Layers, Loader2, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { searchJobsAction, setCurrentJobAction } from '@/app/actions/job-context'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { LIFECYCLE_GROUP_CLASSES, lifecycleGroup } from '@/lib/project-lifecycle'
import { cn } from '@/lib/utils'

export type CurrentJob = { id: string; name: string; projectNumber: string | null; status: ProjectStatus }

type JobOption = CurrentJob & { city: string | null }

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/**
 * Header job context. The selection is remembered server-side and re-verified under RLS on every request,
 * so the menu never reveals jobs the user cannot open.
 */
export function JobSwitcher({ currentJob }: { currentJob: CurrentJob | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pending, startTransition] = useTransition()
  const debounced = useDebounced(query.trim(), 200)
  const listId = useId()
  const nameRef = useRef<HTMLSpanElement>(null)

  const { data, isLoading } = useSWR(open ? ['jobs', debounced] : null, ([, q]) => searchJobsAction(q), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  })
  const jobs: JobOption[] = data ?? []
  // Row 0 is always "All jobs"; rows 1..n are results.
  const rowCount = jobs.length + 1

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const choose = (job: JobOption | null) => {
    startTransition(async () => {
      await setCurrentJobAction(job?.id ?? null)
      close()
      if (job) router.push(`/projects/${encodeURIComponent(job.id)}`)
      else if (pathname.startsWith('/projects/')) router.push('/projects')
    })
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % rowCount)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + rowCount) % rowCount)
    } else if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      choose(active === 0 ? null : jobs[active - 1])
    }
  }

  const optionId = (i: number) => `${listId}-opt-${i}`

  // Title only when the name is actually clipped, so the tooltip never just repeats visible text.
  const syncTruncationTitle = (e: React.SyntheticEvent<HTMLButtonElement>) => {
    const el = nameRef.current
    if (!el || !currentJob) return
    const clipped = el.scrollWidth > el.clientWidth
    if (clipped) e.currentTarget.title = currentJob.name
    else e.currentTarget.removeAttribute('title')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={syncTruncationTitle}
        onFocus={syncTruncationTitle}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-md border bg-card px-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
          currentJob
            ? 'min-w-0 max-w-[11rem] shrink sm:min-w-[7.5rem] sm:max-w-[13rem] md:max-w-[15rem] lg:w-[16.25rem] lg:max-w-[16.25rem]'
            : 'shrink-0',
        )}
        aria-label={currentJob ? `Current job: ${currentJob.name}. Switch job` : 'All jobs. Choose a job'}
      >
        {currentJob ? (
          <span
            className={cn('size-2 shrink-0 rounded-full', LIFECYCLE_GROUP_CLASSES[lifecycleGroup(currentJob.status)].split(' ')[0])}
            aria-hidden="true"
          />
        ) : (
          <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className={cn('min-w-0 flex-1 flex-col leading-tight', currentJob ? 'flex' : 'hidden sm:flex')}>
          <span ref={nameRef} className="truncate font-medium">
            {currentJob ? currentJob.name : 'All Jobs'}
          </span>
          {currentJob?.projectNumber && (
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground md:block">{currentJob.projectNumber}</span>
          )}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Switch job</DialogTitle>
          <DialogDescription className="sr-only">
            Search by job name, number, address, or city. Use the arrow keys to move and Enter to select.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={optionId(active)}
              aria-label="Search jobs"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Search jobs by name, number, or city"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {(isLoading || pending) && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>
          <ul id={listId} role="listbox" aria-label="Jobs" className="max-h-[60vh] overflow-y-auto p-1.5">
            <li
              id={optionId(0)}
              role="option"
              aria-selected={active === 0}
              onMouseEnter={() => setActive(0)}
              onClick={() => choose(null)}
              className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', active === 0 && 'bg-muted')}
            >
              <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 font-medium">All jobs</span>
              {!currentJob && <Check className="size-4 text-primary" aria-label="Current" />}
            </li>
            <li role="presentation" className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {debounced ? 'Matching jobs' : 'Recently updated'}
            </li>
            {jobs.length === 0 && !isLoading && (
              <li role="presentation" className="px-2.5 py-3 text-sm text-muted-foreground">
                {debounced ? 'No jobs match that search.' : 'No active jobs you can open yet.'}
              </li>
            )}
            {jobs.map((job, i) => {
              const row = i + 1
              const selected = currentJob?.id === job.id
              const group = lifecycleGroup(job.status)
              return (
                <li
                  key={job.id}
                  id={optionId(row)}
                  role="option"
                  aria-selected={active === row}
                  onMouseEnter={() => setActive(row)}
                  onClick={() => choose(job)}
                  className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', active === row && 'bg-muted')}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words font-medium text-foreground">{job.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[job.projectNumber, job.city].filter(Boolean).join(' · ') || 'No job number'}
                    </span>
                  </span>
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', LIFECYCLE_GROUP_CLASSES[group])}>
                    {PROJECT_STATUS_LABELS[job.status] ?? job.status}
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-primary" aria-label="Current" />}
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Remembers the job a user opened directly (e.g. from the directory or a link). */
export function RememberJob({ projectId }: { projectId: string }) {
  useEffect(() => {
    void setCurrentJobAction(projectId)
  }, [projectId])
  return null
}
