'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { LauncherIcon } from '@/lib/launcher-actions'

/**
 * A page-owned shortcut offered as a pill above the shared assistant launcher. Pages register only actions the
 * viewer can complete; selecting one runs the page's existing workflow (`onSelect`) or follows its canonical route.
 */
export type LauncherAction = {
  /** Stable id; the central route plan in lib/launcher-actions.ts orders actions by it. */
  id: string
  label: string
  icon: LauncherIcon
  /** Order among actions the route plan does not list; lower sits nearer the launcher. */
  priority?: number
  href?: string
  /** False for forms opened by a search parameter on the same page, so the list keeps its scroll position. */
  scroll?: boolean
  /** Receives the launcher so the opened drawer can hand focus back to it. */
  onSelect?: (trigger: HTMLElement | null) => void
}

type Registry = {
  upsert: (action: LauncherAction) => void
  remove: (id: string) => void
  launcherRef: RefObject<HTMLButtonElement | null>
}

const RegistryContext = createContext<Registry | null>(null)
const ActionsContext = createContext<LauncherAction[]>([])

export function FloatingActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<LauncherAction[]>([])
  const launcherRef = useRef<HTMLButtonElement | null>(null)
  const upsert = useCallback((action: LauncherAction) => {
    setActions((prev) => {
      const at = prev.findIndex((a) => a.id === action.id)
      if (at === -1) return [...prev, action]
      const next = prev.slice()
      next[at] = action
      return next
    })
  }, [])
  const remove = useCallback((id: string) => setActions((prev) => prev.filter((a) => a.id !== id)), [])
  const registry = useMemo(() => ({ upsert, remove, launcherRef }), [upsert, remove])
  return (
    <RegistryContext.Provider value={registry}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
    </RegistryContext.Provider>
  )
}

/** Null outside the staff shell (e.g. the subcontractor portal), where callers keep their own controls. */
export function useLauncherRegistry() {
  return useContext(RegistryContext)
}

export function useRegisteredLauncherActions() {
  return useContext(ActionsContext)
}

/** Focuses the shared launcher, for workflows whose own trigger has left the page. */
export function useFocusLauncher() {
  const launcherRef = useContext(RegistryContext)?.launcherRef
  return useCallback(() => launcherRef?.current?.focus(), [launcherRef])
}

/**
 * Offers an action on the shared launcher while the caller is mounted. Pass null to offer nothing.
 * The handler is read at selection time, so a new closure on every render does not re-register.
 */
export function useLauncherAction(action: LauncherAction | null) {
  const registry = useContext(RegistryContext)
  const latest = useRef(action)
  useEffect(() => {
    latest.current = action
  })
  const id = action?.id
  const label = action?.label
  const icon = action?.icon
  const priority = action?.priority
  const href = action?.href
  const scroll = action?.scroll
  const selectable = Boolean(action?.onSelect)

  useEffect(() => {
    if (!registry || !id || !label || !icon) return
    registry.upsert({
      id,
      label,
      icon,
      priority,
      href,
      scroll,
      onSelect: selectable ? (trigger) => latest.current?.onSelect?.(trigger) : undefined,
    })
    return () => registry.remove(id)
  }, [registry, id, label, icon, priority, href, scroll, selectable])
}

/** Registers a route-based action from a server page (e.g. "Add client" on the clients listing). */
export function RegisterLauncherAction(props: Omit<LauncherAction, 'onSelect'>) {
  useLauncherAction(props)
  return null
}
