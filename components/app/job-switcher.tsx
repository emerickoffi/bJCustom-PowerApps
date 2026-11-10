'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { AlertCircle, ArrowRight, Check, ChevronsUpDown, Layers, Loader2, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useTabletLayout } from '@/components/app/layout-mode'
import { getJobAction, searchJobsAction } from '@/app/actions/job-context'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { JOB_SWITCH_EVENT, resolveRouteJob, switchDestination, type ProjectFilterRoute } from '@/lib/route-job'
import { confirmLeave } from '@/components/app/navigation-guard'
import { stageColor, stageIndicatorColor } from '@/lib/stage-colors'
import { cn } from '@/lib/utils'

type JobOption = { id: string; name: string; projectNumber: string | null; status: ProjectStatus; city: string | null }

function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

/**
 * The project named by the current URL, verified under RLS. Keyed by organization so a workspace switch
 * never reuses another workspace's cached name, and keyed by id so a stale name is never shown for a new id.
 */
function useRouteJob(organizationId: string, filterRoutes: readonly ProjectFilterRoute[]) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scope = resolveRouteJob(pathname, searchParams, filterRoutes)
  const projectId = scope.kind === 'company' ? null : scope.projectId
  const { data, isLoading } = useSWR(
    projectId ? ['route-job', organizationId, projectId] : null,
    ([, , id]) => getJobAction(id),
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  )
  const invalidFilter = scope.kind === 'filter' && Boolean(scope.rawParam) && scope.rawParam !== 'all' && !scope.projectId
  return {
    scope,
    searchParams,
    projectId,
    job: projectId && data?.id === projectId ? data : null,
    loading: Boolean(projectId) && isLoading,
    unavailable: invalidFilter || (Boolean(projectId) && !isLoading && !data),
  }
}

/**
 * Header project selector and the header's only project search. It only reflects the URL: a project route or
 * an explicit `?project=` filter shows that project, every other page shows "All projects". Choosing a project
 * navigates, so the URL stays the single source of truth across refresh, back/forward, and direct links.
 */
export function JobSwitcher({
  organizationId,
  filterRoutes: standardFilterRoutes,
  tabletFilterRoutes,
}: {
  organizationId: string
  filterRoutes: readonly ProjectFilterRoute[]
  /** Routes that filter by `?project=` only in the Tablet layout (the tabbed Home scopes by project). */
  tabletFilterRoutes?: readonly ProjectFilterRoute[]
}) {
  const isTablet = useTabletLayout()
  const filterRoutes = isTablet && tabletFilterRoutes ? tabletFilterRoutes : standardFilterRoutes
  const router = useRouter()
  const { scope, searchParams, projectId, job: currentJob, loading, unavailable } = useRouteJob(organizationId, filterRoutes)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [navigating, startTransition] = useTransition()
  const debounced = useDebounced(query.trim(), 200)
  const listId = useId()
  const nameRef = useRef<HTMLSpanElement>(null)

  const { data, isLoading } = useSWR(
    open ? ['jobs', organizationId, debounced] : null,
    ([, , q]) => searchJobsAction(q),
    { keepPreviousData: true, revalidateOnFocus: false },
  )
  const jobs: JobOption[] = data ?? []
  // Row 0 is always "All projects"; rows 1..n are results.
  const rowCount = jobs.length + 1

  const close = () => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const choose = (job: JobOption | null) => {
    close()
    if ((job?.id ?? null) === projectId && !unavailable) return
    const href = switchDestination(scope, new URLSearchParams(searchParams.toString()), job?.id ?? null)
    if (href && confirmLeave()) {
      window.dispatchEvent(new CustomEvent(JOB_SWITCH_EVENT, { detail: href }))
      startTransition(() => router.push(href))
    }
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

  const label = currentJob
    ? currentJob.name
    : loading
      ? 'Loading project'
      : unavailable
        ? 'Project unavailable'
        : scope.kind === 'filter' && !scope.rawParam && scope.route === '/schedule'
          ? 'Select a project'
          : 'All projects'
  const scoped = Boolean(currentJob) || loading || unavailable

  // Title only when the name is actually clipped, so the tooltip never just repeats visible text.
  const syncTruncationTitle = (e: React.SyntheticEvent<HTMLButtonElement>) => {
    const el = nameRef.current
    if (!el) return
    if (el.scrollWidth > el.clientWidth) e.currentTarget.title = label
    else e.currentTarget.removeAttribute('title')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={syncTruncationTitle}
        onFocus={syncTruncationTitle}
        aria-busy={loading || navigating}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-md border bg-card px-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
          scoped
            ? 'min-w-0 max-w-[11rem] shrink sm:min-w-[7.5rem] sm:max-w-[13rem] md:max-w-[15rem] lg:w-[13rem] lg:max-w-[13rem] xl:w-[16.25rem] xl:max-w-[16.25rem]'
            : 'shrink-0',
        )}
        aria-label={currentJob ? `Current project: ${currentJob.name}. Search or switch project` : `${label}. Search or choose a project`}
      >
        {loading || navigating ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : currentJob ? (
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: stageIndicatorColor(currentJob.status) }}
            aria-hidden="true"
          />
        ) : unavailable ? (
          <AlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className={cn('min-w-0 flex-1 flex-col leading-tight', scoped ? 'flex' : 'hidden sm:flex')}>
          <span ref={nameRef} className={cn('truncate font-medium', !currentJob && scoped && 'text-muted-foreground')}>
            {label}
          </span>
          {currentJob?.projectNumber && (
            <span className="hidden truncate font-mono text-[11px] text-muted-foreground md:block">{currentJob.projectNumber}</span>
          )}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent className="top-[12vh] translate-y-0 gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
          <DialogTitle className="sr-only">Switch project</DialogTitle>
          <DialogDescription className="sr-only">
            Search by project name, number, address, or city. Use the arrow keys to move and Enter to select.
          </DialogDescription>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={optionId(active)}
              aria-label="Search projects"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Search by name, address, or project number"
              className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
          </div>
          <ul id={listId} role="listbox" aria-label="Projects" className="max-h-[60vh] overflow-y-auto p-1.5">
            <li
              id={optionId(0)}
              role="option"
              aria-selected={active === 0}
              onMouseEnter={() => setActive(0)}
              onClick={() => choose(null)}
              className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2.5 py-2', active === 0 && 'bg-muted')}
            >
              <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 font-medium">All projects</span>
              {!scoped && <Check className="size-4 text-primary" aria-label="Current" />}
            </li>
            <li role="presentation" className="px-2.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {debounced ? 'Matching projects' : 'Recently updated'}
            </li>
            {jobs.length === 0 && !isLoading && (
              <li role="presentation" className="px-2.5 py-3 text-sm text-muted-foreground">
                {debounced ? 'No projects match that search.' : 'No active projects you can open yet.'}
              </li>
            )}
            {jobs.map((job, i) => {
              const row = i + 1
              const selected = currentJob?.id === job.id
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
                      {[job.projectNumber, job.city].filter(Boolean).join(' · ') || 'No project number'}
                    </span>
                  </span>
                  <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', stageColor(job.status).badgeClass)}>
                    {PROJECT_STATUS_LABELS[job.status] ?? job.status}
                  </span>
                  {selected && <Check className="size-4 shrink-0 text-primary" aria-label="Current" />}
                </li>
              )
            })}
          </ul>
          {/* The list above is capped; the Projects page carries the same search with every match and its filters. */}
          {debounced && (
            <div className="border-t p-1.5">
              <Link
                href={`/projects?q=${encodeURIComponent(debounced)}`}
                onClick={close}
                className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
              >
                View all matching projects
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
