'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AlertTriangle, CloudOff, CloudUpload, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { fieldOfflinePagesAction } from '@/app/actions/field-offline'
import { useDraftIdentity } from '@/components/shared/draft-scope'
import { useOnline } from '@/components/shared/resilient-save'
import { clearOfflinePages, warmOfflinePages } from '@/components/app/service-worker-register'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { deleteOutboxItem, lastOutboxIdentity, listOutbox, rememberOutboxIdentity, subscribeOutbox } from '@/lib/field-outbox'
import { drainOutbox, recoverInterrupted, retryOutboxItem } from '@/lib/field-outbox-sync'
import { sendOrder, statusText, waitingSummary, type OutboxItem } from '@/lib/field-outbox-shared'
import { cn } from '@/lib/utils'

/** Pages worth keeping offline when visited: project pages, daily logs, schedules and the home pages. */
const WARM_ON_VISIT = /^\/(dashboard|my-work|schedule|projects\/[0-9a-f-]{36}(\/(daily-logs(\/new)?|schedule|issues|walkthroughs))?)$/i
const VISIT_TTL = 6 * 60 * 60 * 1000
const PROJECTS_TTL = 24 * 60 * 60 * 1000
const WARM_KEY = 'trefort-offline-warmed'

function warmedAt(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(WARM_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}
function markWarmed(paths: string[]) {
  try {
    const all = warmedAt()
    const now = Date.now()
    for (const p of paths) all[p] = now
    // Keep the record small.
    const recent = Object.entries(all).sort((a, b) => b[1] - a[1]).slice(0, 120)
    localStorage.setItem(WARM_KEY, JSON.stringify(Object.fromEntries(recent)))
  } catch {
    // Storage disabled: pages are still cached when opened directly.
  }
}

export function useOutboxItems(identity: { userId: string; orgId: string } | null) {
  const [items, setItems] = useState<OutboxItem[]>([])
  useEffect(() => {
    if (!identity) return
    let alive = true
    const load = () =>
      listOutbox(identity.userId, identity.orgId)
        .then((list) => alive && setItems(sendOrder(list)))
        .catch(() => {})
    void load()
    const unsubscribe = subscribeOutbox(load)
    return () => {
      alive = false
      unsubscribe()
    }
  }, [identity])
  return items
}

/**
 * Runs in the staff app: sends waiting field work when the phone is online, keeps key pages ready for offline use,
 * and clears another person's saved pages when someone new signs in on this device.
 */
export function FieldOutboxSync() {
  const identity = useDraftIdentity()
  const online = useOnline()
  const pathname = usePathname()
  const notifiedRef = useRef(0)

  useEffect(() => {
    if (!identity) return
    const previous = lastOutboxIdentity()
    if (previous && previous.userId !== identity.userId) void clearOfflinePages()
    rememberOutboxIdentity(identity)
    void recoverInterrupted(identity).then(() => drainOutbox(identity, true))
  }, [identity])

  // Send on reconnect, when the app comes back to the foreground, and every minute while there is work.
  useEffect(() => {
    if (!identity) return
    const run = (force: boolean) =>
      drainOutbox(identity, force).then((done) => {
        if (done > 0 && Date.now() - notifiedRef.current > 5000) {
          notifiedRef.current = Date.now()
          toast.success(done === 1 ? 'Saved work from this phone was uploaded.' : `${done} saved items from this phone were uploaded.`)
        }
      })
    const onOnline = () => void run(true)
    const onVisible = () => document.visibilityState === 'visible' && void run(false)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(() => void run(false), 60_000)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(timer)
    }
  }, [identity])

  // Keep a full copy of field pages as they are visited (client navigation never fetches the full page).
  useEffect(() => {
    if (!online || !pathname || !WARM_ON_VISIT.test(pathname)) return
    const last = warmedAt()[pathname] ?? 0
    if (Date.now() - last < VISIT_TTL) return
    const t = window.setTimeout(() => {
      void warmOfflinePages([pathname])
      markWarmed([pathname])
    }, 3000)
    return () => window.clearTimeout(t)
  }, [online, pathname])

  // Once a day, also prepare the active jobs so a crew can start a daily log with no signal.
  useEffect(() => {
    if (!online || !identity) return
    const last = warmedAt()['__projects'] ?? 0
    if (Date.now() - last < PROJECTS_TTL) return
    const t = window.setTimeout(async () => {
      try {
        const paths = await fieldOfflinePagesAction()
        await warmOfflinePages(paths)
        markWarmed(['__projects', ...paths])
      } catch {
        // Try again on the next visit.
      }
    }, 8000)
    return () => window.clearTimeout(t)
  }, [online, identity])

  return null
}

/** Header badge: how many items are waiting on this phone, with a list to send now or review. */
export function FieldOutboxIndicator() {
  const identity = useDraftIdentity()
  const online = useOnline()
  const items = useOutboxItems(identity)
  const [busy, setBusy] = useState(false)
  const { count, attention } = waitingSummary(items)

  const sendNow = useCallback(async () => {
    if (!identity) return
    setBusy(true)
    try {
      for (const item of items) if (item.status === 'signed_out') await retryOutboxItem(item)
      await drainOutbox(identity, true)
    } finally {
      setBusy(false)
    }
  }, [identity, items])

  if (!identity || (count === 0 && online)) return null

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'relative flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9',
          attention ? 'text-destructive hover:bg-destructive/10' : 'text-amber-700 hover:bg-amber-50 dark:text-amber-300',
        )}
        aria-label={
          count
            ? `${count} item${count === 1 ? '' : 's'} saved on this phone, waiting to upload${online ? '' : '. You are offline'}`
            : 'You are offline'
        }
      >
        {online ? <CloudUpload className="size-5" aria-hidden="true" /> : <CloudOff className="size-5" aria-hidden="true" />}
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-foreground">{online ? 'Waiting to upload' : 'You are offline'}</p>
          <p className="text-xs text-muted-foreground">
            {online
              ? 'Saved on this phone. It uploads automatically; you can also send it now.'
              : 'Keep working. Daily logs and photos you save stay on this phone and upload when the signal returns.'}
          </p>
        </div>
        {items.length > 0 ? (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-4 py-3">
                {item.status === 'sending' ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : item.status === 'needs_attention' || item.status === 'signed_out' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
                ) : (
                  <CloudUpload className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                  <p className={cn('text-xs', item.status === 'needs_attention' ? 'text-destructive' : 'text-muted-foreground')}>
                    {statusText(item)}
                  </p>
                  {item.status === 'needs_attention' && (
                    <div className="mt-1 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => void retryOutboxItem(item)}>
                        Try again
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (window.confirm(`Delete "${item.label}" from this phone? It was not saved to Trefort.`)) void deleteOutboxItem(item.id)
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted-foreground">Nothing is waiting to upload.</p>
        )}
        {items.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            <Button size="sm" className="w-full" disabled={!online || busy} onClick={sendNow}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
              {online ? 'Send now' : 'Waiting for a connection'}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** Thin banner at the top of the staff app while the phone has no connection. */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-panel border border-amber-300/70 bg-amber-50 px-4 py-2.5 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
    >
      <CloudOff className="size-4 shrink-0" aria-hidden="true" />
      <span>You are offline. Pages you opened before still work, and daily logs you save upload when the signal returns.</span>
    </div>
  )
}
