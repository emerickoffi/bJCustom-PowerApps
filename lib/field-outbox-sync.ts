'use client'

import { saveDailyLogAction } from '@/app/actions/daily-logs'
import { reconcileSaveRequestAction } from '@/app/actions/save-requests'
import { uploadDailyLogPhotos } from '@/components/daily-logs/upload-daily-log-photos'
import { initialActionState } from '@/lib/action-state'
import { classifyThrown, SAVE_EXPECTED_USER_FIELD, SAVE_REQUEST_FIELD, SAVE_RESILIENT_FIELD } from '@/lib/save-requests'
import { dailyLogIdFromHref, isDue, nextRetryDelay, sendOrder, type OutboxItem } from '@/lib/field-outbox-shared'
import { deleteOutboxItem, getOutboxItem, listOutbox, putOutboxItem } from '@/lib/field-outbox'

const SIGNED_OUT = 'Your session ended. Sign in again and your saved work will upload.'

async function update(item: OutboxItem, patch: Partial<OutboxItem>): Promise<OutboxItem> {
  const next = { ...item, ...patch }
  await putOutboxItem(next)
  return next
}

async function retryLater(item: OutboxItem, error: string | null): Promise<void> {
  const attempts = item.attempts + 1
  await update(item, {
    status: item.savedRecordId ? 'photos_pending' : 'waiting',
    attempts,
    lastError: error,
    nextAttemptAt: Date.now() + nextRetryDelay(attempts),
  })
}

/** Saves the entry (or confirms an earlier save went through) and returns the new record's id. */
async function saveRecord(item: OutboxItem): Promise<{ id: string } | { stop: 'signed_out' | 'rejected' | 'retry'; error: string | null }> {
  const fd = new FormData()
  for (const [k, v] of item.entries) fd.append(k, v)
  fd.set(SAVE_REQUEST_FIELD, item.id)
  fd.set(SAVE_RESILIENT_FIELD, '1')
  fd.set(SAVE_EXPECTED_USER_FIELD, item.userId)
  try {
    const result = await saveDailyLogAction(initialActionState, fd)
    const id = result.savedId ?? dailyLogIdFromHref(result.redirectTo)
    if (id) return { id }
    if (result.authRequired) return { stop: 'signed_out', error: SIGNED_OUT }
    if (result.error) return { stop: 'rejected', error: result.error }
    return { stop: 'retry', error: null }
  } catch (e) {
    const thrown = classifyThrown(e)
    if (thrown.kind === 'auth') return { stop: 'signed_out', error: SIGNED_OUT }
    if (thrown.kind === 'forbidden') return { stop: 'rejected', error: 'You no longer have access to this project.' }
    // The request may have committed before the connection dropped: ask instead of guessing.
    try {
      const r = await reconcileSaveRequestAction({ kind: item.kind, requestId: item.id, expectedUser: item.userId })
      if (r.status === 'committed') {
        const id = dailyLogIdFromHref(r.href)
        if (id) return { id }
      }
      if (r.status === 'auth') return { stop: 'signed_out', error: SIGNED_OUT }
    } catch {
      // Still offline; try again later.
    }
    return { stop: 'retry', error: null }
  }
}

async function sendOne(item: OutboxItem): Promise<void> {
  let current = await update(item, { status: 'sending' })

  if (!current.savedRecordId) {
    const saved = await saveRecord(current)
    if ('stop' in saved) {
      if (saved.stop === 'retry') return retryLater(current, saved.error)
      await update(current, {
        status: saved.stop === 'signed_out' ? 'signed_out' : 'needs_attention',
        lastError: saved.error,
      })
      return
    }
    current = await update(current, { savedRecordId: saved.id, status: current.photos.length ? 'photos_pending' : 'sending' })
  }

  if (current.photos.length) {
    const byFile = new Map<File, string>()
    const files = current.photos.map((p) => {
      const file = new File([p.blob], p.fileName, { type: p.mimeType })
      byFile.set(file, p.id)
      return file
    })
    const captions = new Map(current.photos.map((p) => [p.id, p.caption]))
    let result
    try {
      result = await uploadDailyLogPhotos(current.projectId, current.savedRecordId!, files, (f) => captions.get(byFile.get(f) ?? '') ?? '')
    } catch {
      return retryLater(current, 'Photos are waiting for a connection.')
    }
    const failedIds = new Set(result.failed.filter((f) => f.retryable).map((f) => byFile.get(f.item)))
    const remaining = current.photos.filter((p) => failedIds.has(p.id))
    if (remaining.length) {
      current = await update(current, { photos: remaining })
      return retryLater(current, result.failed[0]?.reason ?? null)
    }
  }

  await deleteOutboxItem(current.id)
}

let running: Promise<number> | null = null

/**
 * Sends every due item for this person, oldest first, one at a time. Only one tab sends at once. Returns how many
 * items finished. `force` ignores retry back-off (used when the connection returns or someone taps Send now).
 */
export function drainOutbox(identity: { userId: string; orgId: string }, force = false): Promise<number> {
  if (running) return running
  const work = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 0
    const items = sendOrder(await listOutbox(identity.userId, identity.orgId))
    let done = 0
    for (const item of items) {
      if (!navigator.onLine) break
      if (!isDue(item, Date.now(), force)) continue
      const fresh = await getOutboxItem(item.id, identity.userId)
      if (!fresh || !isDue(fresh, Date.now(), force)) continue
      try {
        await sendOne(fresh)
      } catch {
        await retryLater(fresh, null).catch(() => {})
      }
      if (!(await getOutboxItem(item.id, identity.userId))) done++
    }
    return done
  }
  const locked = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('trefort-field-outbox', { ifAvailable: true }, async (lock) => (lock ? work() : 0))
    }
    return work()
  }
  running = locked().finally(() => {
    running = null
  })
  return running
}

/** Puts a stuck item back in line (for example after signing in again). */
export async function retryOutboxItem(item: OutboxItem): Promise<void> {
  await putOutboxItem({ ...item, status: item.savedRecordId ? 'photos_pending' : 'waiting', nextAttemptAt: 0, lastError: null })
}

/** Items stuck in "sending" (the tab closed mid-upload) go back in line on the next start. */
export async function recoverInterrupted(identity: { userId: string; orgId: string }): Promise<void> {
  for (const item of await listOutbox(identity.userId, identity.orgId)) {
    if (item.status === 'sending') await retryOutboxItem(item)
  }
}
