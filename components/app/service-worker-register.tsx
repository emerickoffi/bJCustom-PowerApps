'use client'

import { useEffect } from 'react'

/** Registers the offline service worker (production only: in development it would cache work in progress). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Unsupported or blocked (private mode): the app simply works online-only.
    })
  }, [])
  return null
}

async function postToWorker(message: unknown) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  ;(reg?.active ?? navigator.serviceWorker.controller)?.postMessage(message)
}

/** Asks the service worker to keep full copies of these pages for offline use. */
export const warmOfflinePages = (paths: string[]) => postToWorker({ type: 'warm', paths })

/** Removes every saved page copy (sign-out, or a different person signing in on this device). */
export async function clearOfflinePages() {
  await postToWorker({ type: 'clear-pages' })
  if (typeof caches !== 'undefined') await caches.delete('trefort-pages-v1').catch(() => false)
}
