/**
 * In-memory hand-off for photos picked on the daily log form before the log has an id.
 *
 * Nothing is uploaded while the photos sit here, so an abandoned form leaves no Storage objects. The form
 * marks the batch as committed when it submits; the saved log page (reached by client navigation after a
 * successful save) claims the batch and uploads it through the normal per-log upload path. Batches are held
 * only in this tab's memory and expire quickly so they can never attach to an unrelated log.
 */

export type PendingDailyLogPhoto = { id: string; file: File; caption: string }

type Batch = {
  projectId: string
  /** Set when editing an existing log; a new log's id is only known after save. */
  logId: string | null
  items: PendingDailyLogPhoto[]
  committedAt: number | null
}

const MAX_AGE_MS = 5 * 60 * 1000
let batch: Batch | null = null

export function stagePendingPhotos(projectId: string, logId: string | null, items: PendingDailyLogPhoto[]) {
  batch = items.length ? { projectId, logId, items, committedAt: null } : null
}

export function commitPendingPhotos() {
  if (batch) batch.committedAt = Date.now()
}

export function uncommitPendingPhotos() {
  if (batch) batch.committedAt = null
}

export function hasStagedPhotos(projectId: string) {
  return Boolean(batch && batch.projectId === projectId && batch.items.length)
}

export function discardPendingPhotos(projectId: string) {
  if (batch?.projectId === projectId && batch.committedAt === null) batch = null
}

/** Returns and clears a committed batch for this project and log, or nothing. */
export function claimPendingPhotos(projectId: string, logId: string): PendingDailyLogPhoto[] {
  const current = batch
  if (!current || current.committedAt === null) return []
  if (Date.now() - current.committedAt > MAX_AGE_MS) {
    batch = null
    return []
  }
  if (current.projectId !== projectId || (current.logId && current.logId !== logId)) return []
  batch = null
  return current.items
}

const takenListeners = new Set<(projectId: string) => void>()

/** The picker clears its previews when the outbox takes its photos. */
export function onPendingPhotosTaken(listener: (projectId: string) => void): () => void {
  takenListeners.add(listener)
  return () => takenListeners.delete(listener)
}

/** Hands every staged photo for this project to the field outbox (offline save) and clears the batch. */
export function takeStagedPhotos(projectId: string): PendingDailyLogPhoto[] {
  const current = batch
  if (!current || current.projectId !== projectId) return []
  batch = null
  for (const l of takenListeners) l(projectId)
  return current.items
}
