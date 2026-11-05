'use client'

import { useActionState, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, CloudOff, HardDrive, Loader2, LogIn, RefreshCw, TriangleAlert } from 'lucide-react'
import { reconcileSaveRequestAction, type ReconcileResult } from '@/app/actions/save-requests'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { deleteDraft, getDraft, putDraft, type DeviceDraft } from '@/lib/device-drafts'
import {
  draftKey,
  fingerprint,
  classifyThrown,
  payloadEntries,
  resolveRequestId,
  SAVE_EXPECTED_USER_FIELD,
  SAVE_REQUEST_FIELD,
  SAVE_RESILIENT_FIELD,
  type PendingSave,
  type SaveKind,
} from '@/lib/save-requests'
import { useDraftIdentity } from '@/components/shared/draft-scope'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type ServerSaveState = 'idle' | 'saving' | 'confirming' | 'saved' | 'failed' | 'auth' | 'conflict'
export type DeviceSaveState = 'clean' | 'unsaved' | 'device' | 'unavailable'

type Recovery = { draft: DeviceDraft; serverChanged: boolean; committedHref?: string }
type Restored = { entries: [string, string][]; values: Record<string, string>; nonce: number }

const AUTH_MESSAGE = 'Your session ended. Sign in again in a new tab, then press Save. Your entries are kept on this device.'
const UNCONFIRMED =
  "We couldn't confirm the save. Your entries are kept. We'll check again when the connection returns, and pressing Save again won't create a duplicate."
const UNCONFIRMED_LEGACY =
  "We couldn't confirm the save. Your entries are kept. Check the list for this record before saving again, so you don't create a copy."
const NOT_RECEIVED = "The save didn't reach the server. Your entries are kept. Press Save to send it again. It won't create a duplicate."

const firstValues = (entries: [string, string][]) => {
  const out: Record<string, string> = {}
  for (const [k, v] of entries) if (!(k in out)) out[k] = v
  return out
}
const canonical = (entries: [string, string][]) => JSON.stringify(entries)

async function withTabLock<T>(name: string | null, busy: T, fn: () => Promise<T>): Promise<T> {
  if (!name || typeof navigator === 'undefined' || !navigator.locks) return fn()
  return navigator.locks.request(`save:${name}`, { ifAvailable: true }, async (lock) => (lock ? fn() : busy))
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}
export const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  )

/**
 * Wraps a form's server action so that a failed, slow or interrupted save never loses entries:
 * entries are kept on this device, each logical save carries a stable request id the server dedupes,
 * and an unknown outcome is checked with the server instead of being retried blindly.
 */
export function useResilientSave(opts: {
  kind: SaveKind
  formType: string
  projectId?: string | null
  recordId?: string | null
  baseRevision?: string | null
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
}) {
  const { kind, formType, projectId = null, recordId = null, baseRevision = null, action } = opts
  const identity = useDraftIdentity()
  const router = useRouter()
  const key = identity ? draftKey({ ...identity, formType, projectId, recordId }) : null
  const formRef = useRef<HTMLFormElement>(null)
  const [device, setDevice] = useState<DeviceSaveState>('clean')
  const [server, setServer] = useState<ServerSaveState>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<Recovery | null>(null)
  const [restored, setRestored] = useState<Restored | null>(null)
  const baselineRef = useRef<string | null>(null)
  const pendingRef = useRef<PendingSave | undefined>(undefined)
  const holdRef = useRef(true)
  const debounceRef = useRef<number | undefined>(undefined)

  const snapshot = useCallback((): [string, string][] => (formRef.current ? payloadEntries(new FormData(formRef.current).entries()) : []), [])

  const persist = useCallback(
    async (entries?: [string, string][]) => {
      if (!key || !identity || holdRef.current) return
      const current = entries ?? snapshot()
      try {
        if (canonical(current) === baselineRef.current && !pendingRef.current) {
          await deleteDraft(key)
          setDevice('clean')
          return
        }
        await putDraft({
          key,
          userId: identity.userId,
          orgId: identity.orgId,
          formType,
          projectId,
          recordId,
          baseRevision,
          entries: current,
          savedAt: Date.now(),
          pending: pendingRef.current,
        })
        setDevice('device')
      } catch {
        setDevice('unavailable')
      }
    },
    [key, identity, snapshot, formType, projectId, recordId, baseRevision],
  )

  const reconcile = useCallback(
    async (requestId: string): Promise<ReconcileResult | { status: 'unknown' }> => {
      try {
        return await reconcileSaveRequestAction({ kind, requestId, expectedUser: identity?.userId })
      } catch {
        return { status: 'unknown' }
      }
    },
    [kind, identity?.userId],
  )

  // Look for unsent work from an earlier visit. Autosave stays paused until the user restores or discards it.
  useEffect(() => {
    if (!key || !identity) {
      holdRef.current = false
      return
    }
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      baselineRef.current = canonical(snapshot())
    })
    getDraft(key, identity.userId, identity.orgId)
      .then(async (draft) => {
        if (cancelled) return
        if (!draft) {
          holdRef.current = false
          return
        }
        let committedHref: string | undefined
        if (draft.pending) {
          const r = await reconcile(draft.pending.requestId)
          const sameAsSent = fingerprint(canonical(draft.entries)) === draft.pending.fingerprint
          if (r.status === 'committed' && sameAsSent) {
            if (recordId) {
              await deleteDraft(key).catch(() => {})
              holdRef.current = false
              return
            }
            committedHref = r.href
          }
        }
        if (cancelled) return
        setRecovery({ draft, serverChanged: Boolean(draft.baseRevision && baseRevision && draft.baseRevision !== baseRevision), committedHref })
      })
      .catch(() => {
        if (cancelled) return
        holdRef.current = false
        setDevice('unavailable')
      })
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
    // Run once per draft key; baseRevision changes come with a new page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  // Keep entries on the device as they change, and flush when the page is hidden or closed.
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const onEdit = () => {
      if (holdRef.current) return
      // Deferred: this native listener runs before React's root listener, so a synchronous state update
      // re-renders mid-event and resets controlled checkboxes before React sees the toggle.
      window.setTimeout(() => setDevice((d) => (d === 'unavailable' ? d : 'unsaved')), 0)
      window.clearTimeout(debounceRef.current)
      debounceRef.current = window.setTimeout(() => void persist(), 600)
    }
    const flush = () => {
      if (document.visibilityState === 'hidden' && !holdRef.current) void persist()
    }
    form.addEventListener('input', onEdit)
    form.addEventListener('change', onEdit)
    form.addEventListener('click', onEdit)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      window.clearTimeout(debounceRef.current)
      form.removeEventListener('input', onEdit)
      form.removeEventListener('change', onEdit)
      form.removeEventListener('click', onEdit)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [persist, restored?.nonce])

  const succeed = useCallback(
    async (href: string) => {
      pendingRef.current = undefined
      holdRef.current = true
      if (key) await deleteDraft(key).catch(() => {})
      setServer('saved')
      setDevice('clean')
      setNotice(null)
      router.push(href)
    },
    [key, router],
  )

  // When confirmation is pending, ask the server again on reconnect or when the tab returns (bounded).
  useEffect(() => {
    if (server !== 'confirming') return
    let attempts = 0
    const check = async () => {
      const p = pendingRef.current
      if (!p || attempts >= 5 || !navigator.onLine || document.visibilityState === 'hidden') return
      attempts++
      const r = await reconcile(p.requestId)
      if (r.status === 'committed') await succeed(r.href)
      else if (r.status === 'not_found') {
        setServer('failed')
        setNotice(NOT_RECEIVED)
      } else if (r.status === 'auth') setServer('auth')
    }
    window.addEventListener('online', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('online', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [server, reconcile, succeed])

  const submit = async (prev: ActionState, fd: FormData): Promise<ActionState> => {
    const entries = payloadEntries(fd.entries())
    const values = firstValues(entries)
    const fp = fingerprint(canonical(entries))
    const requestId = resolveRequestId(pendingRef.current, fp, () => crypto.randomUUID())
    pendingRef.current = { requestId, fingerprint: fp, startedAt: Date.now() }
    fd.set(SAVE_REQUEST_FIELD, requestId)
    fd.set(SAVE_RESILIENT_FIELD, '1')
    if (identity) fd.set(SAVE_EXPECTED_USER_FIELD, identity.userId)
    window.clearTimeout(debounceRef.current)
    holdRef.current = false
    setRecovery(null)
    await persist(entries)

    const busy: ActionState = { error: 'This entry is already being saved in another tab. Wait for it to finish.', values }
    return withTabLock(key, busy, async () => {
      setServer('saving')
      setNotice(null)
      const slow = window.setTimeout(() => setServer('confirming'), 20_000)
      try {
        const result = await action(prev, fd)
        if (result.redirectTo) {
          await succeed(result.redirectTo)
          return { ...result, values }
        }
        if (result.error) {
          // A definite answer from the server: nothing was written, so the next attempt is a new save.
          pendingRef.current = undefined
          setServer(result.authRequired ? 'auth' : result.conflict ? 'conflict' : 'failed')
          void persist(entries)
          return { ...result, values: result.values ?? values }
        }
        setServer('saved')
        return result
      } catch (e) {
        const thrown = classifyThrown(e)
        if (thrown.kind === 'redirect') throw e
        if (thrown.kind === 'auth') {
          setServer('auth')
          return { error: AUTH_MESSAGE, authRequired: true, values }
        }
        if (thrown.kind === 'forbidden') {
          pendingRef.current = undefined
          setServer('failed')
          return { error: 'You no longer have access to this record. Your entries are kept on this device.', values }
        }
        // Unknown outcome: the request may still have committed. Keep the same request id and ask.
        const r = await reconcile(requestId)
        if (r.status === 'committed') {
          await succeed(r.href)
          return { success: 'Saved', values }
        }
        if (r.status === 'auth') {
          setServer('auth')
          return { error: AUTH_MESSAGE, authRequired: true, values }
        }
        if (r.status === 'not_found') {
          setServer('failed')
          return { error: NOT_RECEIVED, values }
        }
        setServer('confirming')
        return { error: r.status === 'unsupported' ? UNCONFIRMED_LEGACY : UNCONFIRMED, values }
      } finally {
        window.clearTimeout(slow)
      }
    })
  }

  const [state, formAction, pending] = useActionState(submit, initialActionState)

  const restore = () => {
    if (!recovery) return
    pendingRef.current = recovery.draft.pending
    setRestored({ entries: recovery.draft.entries, values: firstValues(recovery.draft.entries), nonce: Date.now() })
    setRecovery(null)
    holdRef.current = false
    setDevice('device')
  }
  const discard = async () => {
    pendingRef.current = undefined
    setRecovery(null)
    holdRef.current = false
    if (key) await deleteDraft(key).catch(() => {})
    setDevice('clean')
  }

  return {
    state,
    formAction,
    pending,
    formRef,
    device,
    server,
    notice,
    recovery,
    restored,
    restoreKey: restored?.nonce ?? 0,
    restore,
    discard,
    /** Saves the current entries to the device now (e.g. before reloading the page). */
    flush: () => persist(),
  }
}

export type ResilientSave = ReturnType<typeof useResilientSave>

const SERVER_LABELS: Record<Exclude<ServerSaveState, 'idle'>, string> = {
  saving: 'Saving...',
  confirming: 'Save confirmation pending',
  saved: 'Saved to server',
  failed: 'Save failed. Entries kept',
  auth: 'Sign in to continue',
  conflict: 'Conflict needs review',
}
const DEVICE_LABELS: Record<Exclude<DeviceSaveState, 'clean'>, string> = {
  unsaved: 'Unsaved changes',
  device: 'Saved on this device',
  unavailable: 'Device storage unavailable. Keep this page open',
}

export function SaveStatus({ save, className }: { save: ResilientSave; className?: string }) {
  const online = useOnline()
  const { server, device } = save
  const label = server !== 'idle' ? SERVER_LABELS[server] : device !== 'clean' ? DEVICE_LABELS[device] : null
  if (!label && online) return null
  const tone =
    server === 'failed' || server === 'conflict' || device === 'unavailable'
      ? 'text-destructive'
      : server === 'auth' || server === 'confirming'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-muted-foreground'
  const Icon =
    server === 'saving'
      ? Loader2
      : server === 'saved'
        ? Check
        : server === 'auth'
          ? LogIn
          : server === 'failed' || server === 'conflict' || server === 'confirming' || device === 'unavailable'
            ? TriangleAlert
            : HardDrive
  return (
    <p role="status" aria-live="polite" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium', className)}>
      {label && (
        <span className={cn('inline-flex items-center gap-1.5', tone)}>
          <Icon className={cn('size-3.5', server === 'saving' && 'animate-spin')} aria-hidden="true" />
          {label}
        </span>
      )}
      {!online && (
        <span className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <CloudOff className="size-3.5" aria-hidden="true" />
          Offline. Entries stay on this device
        </span>
      )}
    </p>
  )
}

const baseBannerClass =
  'flex flex-col gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100'

/** Restore/discard prompt, plus the conflict, sign-in and unconfirmed-save explanations. */
export function SaveBanners({
  save,
  latestHref,
  compact = false,
}: {
  save: ResilientSave
  latestHref?: string
  /** Tighter padding and copy, for banners placed inside a form body. */
  compact?: boolean
}) {
  const { recovery, server, notice } = save
  const bannerClass = compact ? cn(baseBannerClass, 'gap-2 px-3 py-2 text-xs sm:gap-3') : baseBannerClass

  if (recovery) {
    const when = new Date(recovery.draft.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    if (recovery.committedHref) {
      return (
        <div role="alert" className={bannerClass}>
          <div className="flex flex-1 items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>Entries from {when} were already saved to the server. The copy on this device is no longer needed.</p>
          </div>
          <div className="flex gap-2">
            <a href={recovery.committedHref} className={buttonVariants({ size: 'sm', variant: 'outline', className: 'bg-background' })}>
              Open saved record
            </a>
            <Button type="button" size="sm" variant="ghost" onClick={save.discard}>
              Clear device copy
            </Button>
          </div>
        </div>
      )
    }
    return (
      <div role="alert" className={bannerClass}>
        <div className="flex flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <p className="font-medium">Unsaved entries from {when} were found on this device.</p>
            {recovery.serverChanged ? (
              <p>The saved record has changed since then. Restoring puts your device copy in the form so you can review it before saving.</p>
            ) : compact ? (
              <p>Not saved to the server yet. Restore them or discard them.</p>
            ) : (
              <p>Restore them to keep working, or discard them.</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={save.restore}>
            Restore
          </Button>
          <Button type="button" size="sm" variant="outline" className="bg-background" onClick={save.discard}>
            Discard
          </Button>
        </div>
      </div>
    )
  }

  if (server === 'conflict') {
    return (
      <div role="alert" className={bannerClass}>
        <div className="flex flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Someone else saved this record after you opened it, so nothing was overwritten. Your entries are kept on this device. Review the latest
            version, then reload and restore your entries to save them on top.
          </p>
        </div>
        <div className="flex gap-2">
          {latestHref && (
            <a href={latestHref} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'bg-background' })}>
              Review latest
            </a>
          )}
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              await save.flush()
              window.location.reload()
            }}
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Reload
          </Button>
        </div>
      </div>
    )
  }

  if (server === 'auth') {
    return (
      <div role="alert" className={bannerClass}>
        <div className="flex flex-1 items-start gap-2">
          <LogIn className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>{AUTH_MESSAGE}</p>
        </div>
        <a href="/auth/login" target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'outline', className: 'bg-background' })}>
          Sign in
        </a>
      </div>
    )
  }

  if (notice) {
    return (
      <p role="alert" className={bannerClass}>
        {notice}
      </p>
    )
  }
  return null
}
