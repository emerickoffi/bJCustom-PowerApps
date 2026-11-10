'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { HardHat, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FloatingActionSlot } from '@/components/app/floating-actions'
import { PeopleAssignWorkspace } from '@/components/projects/people-assign-workspace'
import type { DirectoryRow } from '@/lib/directory-assignment-data'
import { cn } from '@/lib/utils'

const LABEL = 'Assign subcontractors'
const INTRO_SESSION_KEY = 'assign-subcontractors-intro-played'

let introPlayed = false

/** Claims this browser session's single entrance-and-halo run. Returns false once it has been claimed. */
function claimIntro() {
  if (introPlayed) return false
  introPlayed = true
  try {
    if (window.sessionStorage.getItem(INTRO_SESSION_KEY)) return false
    window.sessionStorage.setItem(INTRO_SESSION_KEY, '1')
  } catch {
    // Session storage is blocked, so the module flag limits the intro to once per page load instead.
  }
  return true
}

type Target = { projectId: string; projectName: string; rows: DirectoryRow[] }

type AssignContextValue = {
  openFrom: (trigger: HTMLElement) => void
  focusFloatingAction: () => void
}

const AssignContext = createContext<AssignContextValue | null>(null)

/**
 * Floating "Assign subcontractors" action for one project, plus the assignment drawer it opens.
 * Render it only where the viewer may assign to this project; `AssignSubcontractorsLink` inside
 * `children` opens the same drawer.
 */
export function AssignSubcontractors({
  projectId,
  projectName,
  rows,
  canCreateCompany = false,
  defaultOpen = false,
  children,
}: Target & {
  /** Subcontractor management is on, so the drawer can create a company and assign it. */
  canCreateCompany?: boolean
  /** Opens the drawer on arrival, unfiltered, for links that ask to add people to the project. */
  defaultOpen?: boolean
  children?: ReactNode
}) {
  const [target, setTarget] = useState<Target | null>(defaultOpen ? { projectId, projectName, rows } : null)
  const [open, setOpen] = useState(defaultOpen)
  const [audience, setAudience] = useState<'all' | 'subcontractors'>(defaultOpen ? 'all' : 'subcontractors')
  const floatingRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const openFrom = useCallback(
    (trigger: HTMLElement) => {
      triggerRef.current = trigger
      setTarget({ projectId, projectName, rows })
      setAudience('subcontractors')
      setOpen(true)
    },
    [projectId, projectName, rows],
  )
  const focusFloatingAction = useCallback(() => floatingRef.current?.focus(), [])
  const context = useMemo(() => ({ openFrom, focusFloatingAction }), [openFrom, focusFloatingAction])

  // The project is captured when the overlay opens. A refresh of that same project updates its rows;
  // a different project arriving through props never replaces the one the overlay was opened for.
  const assigning = target && target.projectId === projectId ? { projectId, projectName, rows } : target

  return (
    <AssignContext.Provider value={context}>
      {children}
      <FloatingActionSlot slot="assign" data-yields-to-overlay className="transition-opacity duration-150">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-brand-deep px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
        >
          {LABEL}
        </span>
        <AssignFloatingButton ref={floatingRef} open={open} onOpen={openFrom} />
      </FloatingActionSlot>
      {assigning && (
        <PeopleAssignWorkspace
          key={assigning.projectId}
          projectId={assigning.projectId}
          projectName={assigning.projectName}
          rows={assigning.rows}
          audience={audience}
          canCreateCompany={canCreateCompany}
          open={open}
          onOpenChange={setOpen}
          finalFocus={() => (triggerRef.current?.isConnected ? triggerRef.current : floatingRef.current)}
        />
      )}
    </AssignContext.Provider>
  )
}

/**
 * The floating button itself. It mounts only once the floating stack exists, so its first appearance
 * can be introduced: the wrapper fades in and rises, then a halo behind the button pulses twice.
 * Hover lift and press scale live on the button, so the three effects never share an element.
 */
function AssignFloatingButton({
  ref,
  open,
  onOpen,
}: {
  ref: RefObject<HTMLButtonElement | null>
  open: boolean
  onOpen: (trigger: HTMLElement) => void
}) {
  const [introducing, setIntroducing] = useState(false)

  // Decided before the button first paints, and only while it can be seen: an open drawer or another
  // overlay hides it, and the session's single run is kept for an appearance the viewer gets to see.
  useLayoutEffect(() => {
    const button = ref.current
    if (open || !button) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const visible = button.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true
    if (visible && claimIntro()) setIntroducing(true)
  }, [open, ref])

  return (
    <div className={cn('relative', introducing && 'motion-safe:animate-floating-enter')}>
      {introducing && (
        <span
          aria-hidden="true"
          onAnimationEnd={() => setIntroducing(false)}
          className="pointer-events-none absolute left-0 top-0 size-12 rounded-control opacity-0 motion-safe:animate-floating-halo"
        />
      )}
      <Button
        ref={ref}
        type="button"
        size="icon"
        aria-label={LABEL}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => onOpen(event.currentTarget)}
        // The shared button resets the outline style, so its focus outline needs the style restored to show.
        className="size-12 shadow-lg duration-150 ease-out focus-visible:outline-solid motion-safe:active:scale-[0.97] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:shadow-[0_12px_18px_-4px_rgb(23_33_43/0.16),0_5px_8px_-4px_rgb(23_33_43/0.12)]"
      >
        <HardHat className="size-6 -translate-x-0.5 translate-y-0.5" aria-hidden="true" />
        <span className="absolute right-0.5 top-0.5 flex size-[1.125rem] items-center justify-center rounded-full bg-action-foreground text-action">
          <Plus className="size-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      </Button>
    </div>
  )
}

/** Text link that opens the assignment overlay. Renders nothing where assignment isn't available. */
export function AssignSubcontractorsLink() {
  const assign = useContext(AssignContext)
  const focusFloatingAction = assign?.focusFloatingAction
  const ref = useRef<HTMLButtonElement>(null)

  // The link leaves with its empty state once an assignment lands; keyboard focus moves to the floating action.
  useLayoutEffect(() => {
    const link = ref.current
    return () => {
      if (link && document.activeElement === link) focusFloatingAction?.()
    }
  }, [focusFloatingAction])

  if (!assign) return null
  return (
    <button
      ref={ref}
      type="button"
      aria-haspopup="dialog"
      onClick={(event) => assign.openFrom(event.currentTarget)}
      className="inline-flex min-h-11 items-center rounded-control text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {LABEL}
    </button>
  )
}
