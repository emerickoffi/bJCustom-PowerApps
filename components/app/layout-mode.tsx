'use client'

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from 'react'
import { tabletQueryFor, type LayoutPreference } from '@/lib/ui-layout'

type LayoutModeContextValue = {
  preference: LayoutPreference
  setPreference: (preference: LayoutPreference) => void
}

const LayoutModeContext = createContext<LayoutModeContextValue>({ preference: 'auto', setPreference: () => {} })

/**
 * Sets `data-layout` on the staff shell. CSS (`tablet:` variant) picks the shell chrome from it on first paint, so
 * the server never guesses the viewport and rotation or resizing never remounts page content.
 */
export function LayoutModeProvider({ preference, children }: { preference: LayoutPreference; children: ReactNode }) {
  const [current, setCurrent] = useState(preference)
  const [synced, setSynced] = useState(preference)
  if (synced !== preference) {
    setSynced(preference)
    setCurrent(preference)
  }
  return (
    <LayoutModeContext.Provider value={{ preference: current, setPreference: setCurrent }}>
      <div data-layout={current} className="contents">
        {children}
      </div>
    </LayoutModeContext.Provider>
  )
}

export function useLayoutPreference() {
  return useContext(LayoutModeContext)
}

function subscribeTo(query: string | null) {
  return (onChange: () => void) => {
    if (!query) return () => {}
    const mql = window.matchMedia(query)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }
}

/** Whether the Tablet layout is active. Null until hydrated, when only CSS knows the answer. */
export function useTabletLayout(): boolean | null {
  const { preference } = useLayoutPreference()
  const query = tabletQueryFor(preference)
  return useSyncExternalStore(
    subscribeTo(query),
    () => (query ? window.matchMedia(query).matches : false),
    () => (query ? null : false),
  )
}

/**
 * Renders the matching presentation of a page. Before hydration both are present and CSS shows one, avoiding
 * flicker and hydration mismatches; afterwards the inactive one is unmounted so its client widgets, ids, and
 * requests are not duplicated. The wrappers stay in place so switching never remounts the active presentation.
 */
export function LayoutSwitch({ standard, tablet }: { standard: ReactNode; tablet: ReactNode }) {
  const isTablet = useTabletLayout()
  return (
    <>
      <div className="contents tablet:hidden">{isTablet !== true && standard}</div>
      <div className="hidden tablet:contents">{isTablet !== false && tablet}</div>
    </>
  )
}
