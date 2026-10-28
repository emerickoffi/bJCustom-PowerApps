'use client'

import { useEffect } from 'react'

/**
 * Moves keyboard focus to the element named by the URL hash so screen reader and
 * keyboard users land on the linked record, not just scroll to it.
 * Targets need tabIndex={-1} and a scroll margin that clears the sticky header.
 */
export function FocusHashTarget() {
  useEffect(() => {
    const focusTarget = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const el = document.getElementById(id)
      if (!el) return
      el.scrollIntoView({ block: 'start' })
      el.focus({ preventScroll: true })
    }
    focusTarget()
    window.addEventListener('hashchange', focusTarget)
    return () => window.removeEventListener('hashchange', focusTarget)
  }, [])
  return null
}
