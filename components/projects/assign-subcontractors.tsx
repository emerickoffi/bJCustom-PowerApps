'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { HardHat, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FloatingActionSlot } from '@/components/app/floating-actions'
import { PeopleAssignWorkspace } from '@/components/projects/people-assign-workspace'
import type { DirectoryRow } from '@/lib/directory-assignment-data'

const LABEL = 'Assign subcontractors'

type Target = { projectId: string; projectName: string; rows: DirectoryRow[] }

type AssignContextValue = {
  openFrom: (trigger: HTMLElement) => void
  focusFloatingAction: () => void
}

const AssignContext = createContext<AssignContextValue | null>(null)

/**
 * Floating "Assign subcontractors" action for one project, plus the bulk assignment overlay it opens.
 * Render it only where the viewer may assign to this project; `AssignSubcontractorsLink` inside
 * `children` opens the same overlay.
 */
export function AssignSubcontractors({ projectId, projectName, rows, children }: Target & { children?: ReactNode }) {
  const [target, setTarget] = useState<Target | null>(null)
  const [open, setOpen] = useState(false)
  const floatingRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const openFrom = useCallback(
    (trigger: HTMLElement) => {
      triggerRef.current = trigger
      setTarget({ projectId, projectName, rows })
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
        <Button
          ref={floatingRef}
          type="button"
          size="icon"
          aria-label={LABEL}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(event) => openFrom(event.currentTarget)}
          // The shared button resets the outline style, so its focus outline needs the style restored to show.
          className="size-12 shadow-lg focus-visible:outline-solid"
        >
          <HardHat className="size-6 -translate-x-0.5 translate-y-0.5" aria-hidden="true" />
          <span className="absolute right-0.5 top-0.5 flex size-[1.125rem] items-center justify-center rounded-full bg-action-foreground text-action">
            <Plus className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </span>
        </Button>
      </FloatingActionSlot>
      {assigning && (
        <PeopleAssignWorkspace
          key={assigning.projectId}
          projectId={assigning.projectId}
          projectName={assigning.projectName}
          rows={assigning.rows}
          audience="subcontractors"
          open={open}
          onOpenChange={setOpen}
          finalFocus={() => (triggerRef.current?.isConnected ? triggerRef.current : floatingRef.current)}
        />
      )}
    </AssignContext.Provider>
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
