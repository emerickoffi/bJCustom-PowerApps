'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFocusLauncher, useLauncherAction } from '@/components/app/floating-actions'
import { PeopleAssignWorkspace } from '@/components/projects/people-assign-workspace'
import type { DirectoryRow } from '@/lib/directory-assignment-data'

const LABEL = 'Assign subcontractors'

type Target = { projectId: string; projectName: string; rows: DirectoryRow[] }

type AssignContextValue = {
  openFrom: (trigger: HTMLElement | null) => void
  focusLauncher: () => void
}

const AssignContext = createContext<AssignContextValue | null>(null)

/**
 * The "Assign subcontractor" launcher action for one project, plus the assignment drawer it opens.
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
  const triggerRef = useRef<HTMLElement | null>(null)
  const focusLauncher = useFocusLauncher()

  const openFrom = useCallback(
    (trigger: HTMLElement | null) => {
      triggerRef.current = trigger
      setTarget({ projectId, projectName, rows })
      setAudience('subcontractors')
      setOpen(true)
    },
    [projectId, projectName, rows],
  )
  const context = useMemo(() => ({ openFrom, focusLauncher }), [openFrom, focusLauncher])

  useLauncherAction({ id: 'assign', label: 'Assign subcontractor', icon: 'subcontractor', onSelect: openFrom })

  // The project is captured when the overlay opens. A refresh of that same project updates its rows;
  // a different project arriving through props never replaces the one the overlay was opened for.
  const assigning = target && target.projectId === projectId ? { projectId, projectName, rows } : target

  return (
    <AssignContext.Provider value={context}>
      {children}
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
          finalFocus={() =>
            triggerRef.current?.isConnected
              ? triggerRef.current
              : document.querySelector<HTMLElement>('[data-floating-stack] [aria-label="Trefort assistant"]')
          }
        />
      )}
    </AssignContext.Provider>
  )
}

/** Text link that opens the assignment overlay. Renders nothing where assignment isn't available. */
export function AssignSubcontractorsLink() {
  const assign = useContext(AssignContext)
  const focusLauncher = assign?.focusLauncher
  const ref = useRef<HTMLButtonElement>(null)

  // The link leaves with its empty state once an assignment lands; keyboard focus moves to the shared launcher.
  useLayoutEffect(() => {
    const link = ref.current
    return () => {
      if (link && document.activeElement === link) focusLauncher?.()
    }
  }, [focusLauncher])

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
