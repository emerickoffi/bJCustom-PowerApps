'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  CircleCheck,
  ClipboardList,
  ImageOff,
  Loader2,
  MapPin,
  RefreshCw,
  Settings2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CoverImage } from '@/components/projects/cover-image'
import { ActivityStatusBadge } from '@/components/schedule/schedule-badges'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import type { ProjectStatus } from '@/lib/domain'
import type { NextActionTone } from '@/lib/next-actions'
import {
  PREVIEW_PANEL_ID,
  previewApiPath,
  previewErrorState,
  type PreviewLatestUpdate,
  type PreviewNextActivity,
  type ProjectPreview,
} from '@/lib/project-preview'
import { cn } from '@/lib/utils'

export type PreviewListProject = { id: string; name: string; project_number: string; status: ProjectStatus }

class PreviewRequestError extends Error {
  constructor(readonly status: number | null) {
    super('project_preview_failed')
  }
}

async function fetchPreview(url: string): Promise<ProjectPreview> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new PreviewRequestError(null)
  }
  // An expired session is redirected to the sign-in page rather than answered with JSON.
  if (res.redirected) throw new PreviewRequestError(401)
  if (!res.ok) throw new PreviewRequestError(res.status)
  try {
    return (await res.json()) as ProjectPreview
  } catch {
    throw new PreviewRequestError(null)
  }
}

const MIN_PANEL_HEIGHT = 256
const TITLE_CLASS = 'min-w-0 flex-1 text-pretty break-words font-serif text-lg font-semibold leading-snug text-foreground'
const SECTION_CLASS = 'flex flex-col gap-2.5 px-4 py-3.5'
const HEADING_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
const LINK_CLASS =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring'

const ATTENTION_TONE: Record<NextActionTone, { icon: LucideIcon; className: string; label: string }> = {
  critical: { icon: AlertTriangle, className: 'bg-destructive/10 text-destructive', label: 'Needs attention' },
  review: { icon: ClipboardList, className: 'bg-sage text-primary', label: 'To review' },
  setup: { icon: Settings2, className: 'bg-champagne-soft text-warning', label: 'Setup' },
}

function PreviewHeader({
  project,
  title,
  onClose,
  className,
}: {
  project: PreviewListProject
  title: React.ReactNode
  onClose: () => void
  className?: string
}) {
  return (
    <header className={cn('flex shrink-0 flex-col gap-2.5 border-b border-[#D6DDE5] px-4 py-3.5', className)}>
      <div className="flex items-start gap-2">
        {title}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-mt-1 -mr-2 shrink-0"
          aria-label="Close project preview"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            <span className="sr-only">Project ID </span>
            {project.project_number}
          </span>
          <ProjectStatusBadge status={project.status} />
        </div>
        <Button variant="view" size="sm" render={<Link href={`/projects/${project.id}`} />} nativeButton={false}>
          Open project
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </header>
  )
}

function SummaryItem({ icon: Icon, label, value, missing }: { icon: LucideIcon; label: string; value: string | null; missing: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
      </dt>
      <dd className={cn('break-words pl-5 text-sm', value ? 'text-foreground' : 'text-muted-foreground')}>{value ?? missing}</dd>
    </div>
  )
}

function AttentionSection({ attention, projectHref }: { attention: ProjectPreview['attention']; projectHref: string }) {
  const headingId = useId()
  const empty = attention.items.length === 0
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} className={HEADING_CLASS}>
        Needs attention
      </h3>
      {empty && !attention.incomplete && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CircleCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
          No pending actions
        </p>
      )}
      {!empty && (
        <ul className="flex flex-col gap-1.5">
          {attention.items.map((item) => {
            const tone = ATTENTION_TONE[item.tone]
            const Icon = tone.icon
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="group/item flex items-start gap-2.5 rounded-lg border border-[#D6DDE5] p-2.5 outline-none transition-colors hover:border-primary/40 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', tone.className)}>
                    <Icon className="size-3.5" aria-hidden="true" />
                    <span className="sr-only">{`${tone.label}: `}</span>
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="break-words text-sm font-medium leading-snug text-foreground">{item.title}</span>
                    <span className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{item.description}</span>
                  </span>
                  <ArrowRight
                    className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover/item:translate-x-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {attention.hiddenCount > 0 && (
        <Link href={projectHref} className={LINK_CLASS}>
          {`${attention.hiddenCount} more on the project overview`}
        </Link>
      )}
      {attention.incomplete && (
        <p role="status" className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {empty ? 'Pending actions could not be checked.' : 'Some checks could not load, so this list may be incomplete.'}
        </p>
      )}
    </section>
  )
}

const NEXT_ACTIVITY_MESSAGE: Record<Exclude<PreviewNextActivity['state'], 'ready' | 'off'>, string> = {
  error: 'Schedule activities could not be loaded.',
  empty: 'No schedule activities yet.',
  complete: 'All activities complete.',
  undated: 'Open activities have no planned dates yet.',
}

function NextActivitySection({ next }: { next: PreviewNextActivity }) {
  const headingId = useId()
  if (next.state === 'off') return null
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} className={HEADING_CLASS}>
        {next.state === 'ready' && next.milestone ? 'Next milestone' : 'Next activity'}
      </h3>
      {next.state === 'ready' ? (
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link href={next.href} className={cn(LINK_CLASS, 'break-words')}>
            {next.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{next.plannedLabel}</span>
            <ActivityStatusBadge status={next.status} />
            {next.overdue && <span className="font-semibold text-destructive">Overdue</span>}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
            {next.assigneeName ? `Assigned to ${next.assigneeName}` : 'Unassigned'}
          </p>
        </div>
      ) : (
        <>
          <p
            role={next.state === 'error' ? 'status' : undefined}
            className={cn('text-sm', next.state === 'error' ? 'text-warning' : 'text-muted-foreground')}
          >
            {NEXT_ACTIVITY_MESSAGE[next.state]}
          </p>
          <Link href={next.scheduleHref} className={LINK_CLASS}>
            Open schedule
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  )
}

function LatestUpdateSection({ update }: { update: PreviewLatestUpdate }) {
  const headingId = useId()
  if (update.state === 'off') return null
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h3 id={headingId} className={HEADING_CLASS}>
        Latest update
      </h3>
      {update.state === 'error' && (
        <p role="status" className="text-sm text-warning">
          The latest daily log could not be loaded.
        </p>
      )}
      {update.state === 'empty' && <p className="text-sm text-muted-foreground">No daily logs yet.</p>}
      {update.state === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{update.dateLabel}</span>
            {update.draft && (
              <span className="rounded-badge bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Draft</span>
            )}
          </div>
          <p className={cn('line-clamp-3 break-words text-sm leading-relaxed', update.summary ? 'text-foreground' : 'text-muted-foreground')}>
            {update.summary ?? 'No notes recorded yet.'}
          </p>
          {update.photos.length > 0 && (
            <ul className="grid grid-cols-3 gap-2">
              {update.photos.map((photo) => (
                <li key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                  <CoverImage
                    src={photo.url}
                    alt={photo.alt}
                    className="size-full object-cover"
                    fallback={
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" aria-hidden="true" />
                        <span className="sr-only">Photo unavailable</span>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {update.morePhotos > 0 && (
            <p className="text-xs text-muted-foreground">
              {`${update.morePhotos} more ${update.morePhotos === 1 ? 'photo' : 'photos'} in this log`}
            </p>
          )}
          <Link href={update.href} className={LINK_CLASS}>
            View daily log
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  )
}

function PreviewSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-5 px-4 py-4">
      <span className="sr-only">Loading project details</span>
      {[0, 1, 2].map((block) => (
        <div key={block} className="flex animate-pulse flex-col gap-2 motion-reduce:animate-none" aria-hidden="true">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function PreviewBody({ project }: { project: PreviewListProject }) {
  const { data, error, isValidating, mutate } = useSWR(previewApiPath(project.id), fetchPreview, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  // A response is only ever shown under the project it was loaded for.
  const preview = data?.id === project.id ? data : null
  const failure = error ? previewErrorState(error instanceof PreviewRequestError ? error.status : null) : null

  if (failure && (!preview || !failure.retry)) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 px-4 py-4">
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {failure.message}
        </p>
        {failure.retry && (
          <Button type="button" variant="outline" size="sm" disabled={isValidating} onClick={() => mutate()}>
            {isValidating ? (
              <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {isValidating ? 'Loading' : 'Try again'}
          </Button>
        )}
      </div>
    )
  }
  if (!preview) return <PreviewSkeleton />

  const { summary } = preview
  return (
    <div className="flex flex-col divide-y divide-[#D6DDE5]/70">
      <section aria-label="Summary" className={SECTION_CLASS}>
        <dl className="flex flex-col gap-2.5">
          <SummaryItem icon={MapPin} label="Address" value={summary.address} missing="No address on file" />
          <SummaryItem icon={UserRound} label="Project manager" value={summary.managerName} missing="Unassigned" />
          <SummaryItem
            icon={CalendarCheck}
            label={summary.dateLabel}
            value={summary.dateValue}
            missing={summary.dateLabel === 'Completed' ? 'Not recorded' : 'Not set'}
          />
        </dl>
      </section>
      <AttentionSection attention={preview.attention} projectHref={`/projects/${project.id}`} />
      <NextActivitySection next={preview.nextActivity} />
      <LatestUpdateSection update={preview.latestUpdate} />
    </div>
  )
}

/** Desktop preview: an in-layout column beside the list. A labeled region, never a modal, so focus is not trapped. */
export function ProjectPreviewPanel({
  project,
  onClose,
  className,
}: {
  project: PreviewListProject
  onClose: () => void
  className?: string
}) {
  const ref = useRef<HTMLElement>(null)

  // The panel starts level with the list and only sticks below the header once the page scrolls, so the room beneath
  // it changes. Its height follows that room, ending above the floating actions in the bottom-right corner.
  useLayoutEffect(() => {
    const panel = ref.current
    if (!panel) return
    let frame = 0
    const fit = () => {
      frame = 0
      const stack = document.querySelector('[data-floating-stack]')?.getBoundingClientRect()
      const floor = stack && stack.height > 0 ? stack.top - 12 : window.innerHeight - 16
      const top = Math.max(panel.getBoundingClientRect().top, 0)
      panel.style.maxHeight = `${Math.max(MIN_PANEL_HEIGHT, floor - top)}px`
    }
    const schedule = () => {
      frame ||= requestAnimationFrame(fit)
    }
    fit()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
    // The display class changes once the viewport is known, which is when the panel first has a measurable position.
  }, [className])

  return (
    <section
      ref={ref}
      id={PREVIEW_PANEL_ID}
      aria-label="Project preview"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.stopPropagation()
        onClose()
      }}
      className={cn(
        // The max-height here is the first-paint value for the stuck position; the effect above refines it.
        'sticky top-[calc(5rem+env(safe-area-inset-top))] max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top))] w-[25rem] shrink-0 flex-col overflow-hidden rounded-xl border border-[#D6DDE5] bg-card shadow-xs animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none',
        className,
      )}
    >
      <PreviewHeader project={project} onClose={onClose} title={<h2 className={TITLE_CLASS}>{project.name}</h2>} />
      <div key={project.id} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <PreviewBody project={project} />
      </div>
    </section>
  )
}

/** Below desktop width the same content opens as a modal drawer: right-side on tablets, a full-width sheet on phones. */
export function ProjectPreviewDrawer({
  project,
  onClose,
  finalFocus,
}: {
  project: PreviewListProject | null
  onClose: () => void
  finalFocus?: React.ComponentProps<typeof DialogPrimitive.Popup>['finalFocus']
}) {
  // The last project stays rendered through the closing transition.
  const [shown, setShown] = useState(project)
  if (project && project !== shown) setShown(project)
  const current = project ?? shown

  return (
    <DialogPrimitive.Root open={Boolean(project)} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <DialogPrimitive.Popup
          id={PREVIEW_PANEL_ID}
          finalFocus={finalFocus}
          className="fixed inset-0 z-50 flex h-screen max-h-dvh w-full flex-col overflow-hidden bg-card text-sm text-foreground shadow-xl outline-none transition duration-200 ease-out data-ending-style:translate-x-6 data-ending-style:opacity-0 data-starting-style:translate-x-6 data-starting-style:opacity-0 motion-reduce:transition-none sm:left-auto sm:max-w-md sm:border-l sm:border-[#D6DDE5]"
        >
          {current && (
            <>
              <PreviewHeader
                project={current}
                onClose={onClose}
                className="pt-[max(0.875rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]"
                title={<DialogPrimitive.Title className={TITLE_CLASS}>{current.name}</DialogPrimitive.Title>}
              />
              <div
                key={current.id}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]"
              >
                <PreviewBody project={current} />
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
