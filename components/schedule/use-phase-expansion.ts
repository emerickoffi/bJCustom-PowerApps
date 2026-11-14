'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

// Only opaque phase IDs are stored; no names or other project details leave the server.
const PREFIX = 'trefort:schedule-expanded:v1'
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

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set()
  try {
    const value: unknown = JSON.parse(raw)
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function phaseExpansionKey(organizationId: string, userId: string, projectId: string) {
  return `${PREFIX}:${organizationId}:${userId}:${projectId}`
}

/**
 * The phases this user has chosen to keep open on this project's schedule. Anything not listed is collapsed,
 * so first visits and newly added phases start collapsed, and deleted phases simply drop out.
 */
export function usePhaseExpansion(key: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  )
  const expanded = useMemo(() => parse(raw), [raw])
  const save = useCallback(
    (next: Iterable<string>) => {
      try {
        const ids = [...new Set(next)]
        if (ids.length) window.localStorage.setItem(key, JSON.stringify(ids))
        else window.localStorage.removeItem(key)
      } catch {
        // Storage can be full or disabled; the schedule then just opens collapsed next time.
      }
      listeners.forEach((l) => l())
    },
    [key],
  )
  return [expanded, save] as const
}
