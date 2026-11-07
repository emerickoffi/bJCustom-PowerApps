'use client'

import { useEffect, useId } from 'react'

const DEFAULT_PROMPT = 'You have unsaved changes. Discard them and leave this page?'

/** Ids of mounted forms with unsaved edits, mapped to the prompt each wants shown. */
const dirtyForms = new Map<string, string>()

/** Asks before leaving when any registered form is dirty. Returns true when navigation may continue. */
export function confirmLeave(): boolean {
  if (dirtyForms.size === 0) return true
  const prompt = [...dirtyForms.values()][0] ?? DEFAULT_PROMPT
  if (!window.confirm(prompt)) return false
  // The user chose to discard; don't ask again for the same navigation.
  dirtyForms.clear()
  return true
}

/** Registers a full-page form's unsaved state with the app-wide leave guard. */
export function useUnsavedNavigationGuard(dirty: boolean, prompt: string = DEFAULT_PROMPT) {
  const id = useId()
  useEffect(() => {
    if (!dirty) return
    dirtyForms.set(id, prompt)
    return () => {
      dirtyForms.delete(id)
    }
  }, [dirty, id, prompt])
}

/**
 * Intercepts in-app link clicks in the capture phase, before Next's Link starts a client navigation, so
 * sidebar, header, tab, and breadcrumb links all respect unsaved edits. Links that run their own discard
 * prompt opt out with `data-skip-leave-guard`.
 */
export function NavigationGuard() {
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (dirtyForms.size === 0) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('data-skip-leave-guard')) return
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return
      const next = new URL(anchor.href, window.location.href)
      if (next.origin !== window.location.origin) return
      const sameDocument = next.pathname === window.location.pathname && next.search === window.location.search
      if (sameDocument) return
      if (!confirmLeave()) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
