'use client'

import { toast } from 'sonner'

/**
 * Remembers the last few errors this tab showed or hit, so a help request can say exactly what went wrong
 * ("Something went wrong. Please try again." at 6:42 pm on the estimate page) instead of "it doesn't work".
 * Kept in memory only: nothing is stored or sent until the person sends a help request.
 */

export type RecordedError = { message: string; path: string; at: string }

const MAX = 5
const recent: RecordedError[] = []
let installed = false

export function recordHelpError(message: unknown) {
  const text = typeof message === 'string' ? message : message instanceof Error ? message.message : ''
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (!clean) return
  recent.push({ message: clean, path: typeof window === 'undefined' ? '' : window.location.pathname, at: new Date().toISOString() })
  if (recent.length > MAX) recent.shift()
}

export function recentHelpErrors(): RecordedError[] {
  return [...recent]
}

/** Call once on the client. Records error toasts and uncaught errors from then on. */
export function installHelpErrorCapture() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const original = toast.error
  toast.error = ((message: Parameters<typeof toast.error>[0], data?: Parameters<typeof toast.error>[1]) => {
    recordHelpError(typeof message === 'function' ? '' : (message as unknown))
    return original(message, data)
  }) as typeof toast.error

  window.addEventListener('error', (event) => recordHelpError(event.message))
  window.addEventListener('unhandledrejection', (event) => recordHelpError(event.reason))
}

/** One block of text for the support email and owner console. */
export function formatRecentErrors(errors: RecordedError[]): string {
  return errors
    .slice(-3)
    .map((e) => `${e.message} (${e.path || 'unknown page'}, ${e.at})`)
    .join('\n')
    .slice(0, 1000)
}
