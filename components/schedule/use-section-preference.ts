'use client'

import { useCallback, useSyncExternalStore } from 'react'

// Only a section name and an open/closed flag are stored; no project details leave the server.
const PREFIX = 'trefort:schedule-section:v1'
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Remembers whether the user last left a supporting schedule section open. Until they choose, the section uses
 * `defaultOpen`, so a section can start collapsed when empty and open when it has content.
 */
export function useSectionPreference(name: string | undefined, defaultOpen: boolean) {
  const key = name ? `${PREFIX}:${name}` : null
  const raw = useSyncExternalStore(
    subscribe,
    () => (key ? read(key) : null),
    () => null,
  )
  const open = raw === '1' ? true : raw === '0' ? false : defaultOpen
  const setOpen = useCallback(
    (next: boolean) => {
      if (!key) return
      try {
        window.localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // Storage can be full or disabled; the section then falls back to its default next visit.
      }
      listeners.forEach((l) => l())
    },
    [key],
  )
  return [open, setOpen] as const
}
