'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { AlertTriangle, ArrowRight, Loader2, MapPin, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { FormPanelHandle } from '@/components/shared/form-overlay'
import { AssignView } from '@/components/projects/project-preview-assign'
import { PreviewRequestError, fetchPreviewJson } from '@/components/projects/project-preview-request'
import {
  LatestUpdateSection,
  PendingQuestionsSection,
  PeopleSection,
  UpcomingWorkSection,
} from '@/components/projects/project-preview-sections'
import { SubcontractorListView } from '@/components/projects/project-preview-subcontractors'
import { PREVIEW_PANEL_ID, previewApiPath, previewErrorState, type ProjectPreview } from '@/lib/project-preview'
import { cn } from '@/lib/utils'

export type PreviewListProject = { id: string; name: string; project_number: string }

/**
 * Asked before the preview closes or shows another project. Returns true when that may happen now; otherwise the
 * open view holds unsaved entries, asks about them, and runs `proceed` itself if they are discarded.
 */
export type PreviewLeaveGuard = (proceed: () => void) => boolean

/** The summary, or one of the views that temporarily replaces it inside the same panel. */
type PanelView = 'summary' | 'subcontractors' | 'assign'

const MIN_PANEL_HEIGHT = 256
const TITLE_CLASS = 'min-w-0 flex-1 text-pretty break-words font-serif text-lg font-semibold leading-snug text-foreground'
const SCROLL_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
const DRAWER_INSETS = 'pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]'

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
        <span className="font-mono text-xs text-muted-foreground">
          <span className="sr-only">Project ID </span>
          {project.project_number}
        </span>
        <Button variant="view" size="sm" render={<Link href={`/projects/${project.id}`} />} nativeButton={false}>
          Open project
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
    </header>
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

function PreviewBody({
  project,
  guardRef,
  drawer = false,
}: {
  project: PreviewListProject
  guardRef: React.RefObject<PreviewLeaveGuard | null>
  drawer?: boolean
}) {
  const { data, error, isValidating, mutate } = useSWR(previewApiPath(project.id), fetchPreviewJson<ProjectPreview>, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  // A response is only ever shown under the project it was loaded for.
  const preview = data?.id === project.id ? data : null
  const failure = error ? previewErrorState(error instanceof PreviewRequestError ? error.status : null) : null

  const [view, setView] = useState<PanelView>('summary')
  const rootRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<FormPanelHandle>(null)
  const focusAfterChange = useRef<string | null>(null)

  useEffect(() => {
    guardRef.current = (proceed) => formRef.current?.requestLeave(proceed) ?? true
    return () => {
      guardRef.current = null
    }
  }, [guardRef])

  // Keyboard focus follows the view: into a view's Back control, and back out to the control that opened it.
  const show = useCallback(
    (next: PanelView) => {
      focusAfterChange.current = next === 'summary' ? `[data-view-trigger="${view}"]` : '[data-view-focus]'
      setView(next)
    },
    [view],
  )
  useEffect(() => {
    const selector = focusAfterChange.current
    const root = rootRef.current
    if (!selector || !root) return
    focusAfterChange.current = null
    const target = root.querySelector<HTMLElement>(selector) ?? root.querySelector<HTMLElement>('[data-view-fallback]')
    target?.focus()
  }, [view])

  const leaveAssignment = useCallback(() => {
    show('summary')
    // Whatever was assigned shows up in the list and its count; the rest of the summary stays in place meanwhile.
    void mutate()
  }, [show, mutate])

  const blocked = failure && (!preview || !failure.retry)
  const subcontractors = preview?.people.subcontractors
  const assigning = view === 'assign' && Boolean(preview?.people.canAssign) && !blocked
  const listing = view === 'subcontractors' && subcontractors?.state === 'ready' && !blocked

  let content: React.ReactNode
  if (blocked) {
    content = (
      <div role="alert" className="flex flex-col items-start gap-3 px-4 py-4">
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {failure.message}
        </p>
        {failure.retry && (
          <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" disabled={isValidating} onClick={() => mutate()}>
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
  } else if (!preview) {
    content = <PreviewSkeleton />
  } else if (listing && subcontractors?.state === 'ready') {
    content = <SubcontractorListView items={subcontractors.items} peopleHref={preview.people.peopleHref} onBack={() => show('summary')} />
  } else {
    content = (
      <div className="flex flex-col divide-y divide-[#D6DDE5]/70">
        {preview.address && (
          <p className="flex items-start gap-1.5 px-4 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="break-words">
              <span className="sr-only">Address: </span>
              {preview.address}
            </span>
          </p>
        )}
        <PeopleSection
          people={preview.people}
          retrying={isValidating}
          onRetry={() => mutate()}
          onViewAll={() => show('subcontractors')}
          onAssign={() => show('assign')}
        />
        <UpcomingWorkSection next={preview.nextActivity} />
        <LatestUpdateSection update={preview.latestUpdate} />
        <PendingQuestionsSection questions={preview.questions} />
      </div>
    )
  }

  return (
    // The assignment view asks for the full height so the panel does not resize as its list is searched and filtered.
    <div ref={rootRef} className={cn('flex min-h-0 flex-col', assigning ? 'grow basis-[100dvh]' : 'flex-1')}>
      {assigning ? (
        <AssignView
          project={project}
          handleRef={formRef}
          onDone={leaveAssignment}
          className={drawer ? 'pr-[env(safe-area-inset-right)]' : undefined}
        />
      ) : (
        <div className={cn(SCROLL_CLASS, drawer && DRAWER_INSETS)}>{content}</div>
      )}
    </div>
  )
}

/** Desktop preview: an in-layout column beside the list. A labeled region, never a modal, so focus is not trapped. */
export function ProjectPreviewPanel({
  project,
  onClose,
  guardRef,
  className,
}: {
  project: PreviewListProject
  onClose: () => void
  guardRef: React.RefObject<PreviewLeaveGuard | null>
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
      <PreviewBody key={project.id} project={project} guardRef={guardRef} />
    </section>
  )
}

/** Below desktop width the same content opens as a modal drawer: right-side on tablets, a full-width sheet on phones. */
export function ProjectPreviewDrawer({
  project,
  onClose,
  guardRef,
  finalFocus,
}: {
  project: PreviewListProject | null
  onClose: () => void
  guardRef: React.RefObject<PreviewLeaveGuard | null>
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
              <PreviewBody key={current.id} project={current} guardRef={guardRef} drawer />
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
