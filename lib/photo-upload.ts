/**
 * Shared, framework-free logic for field photo uploads: when to downscale a photo before upload, and how a
 * batch of uploads reports per-file failures so only the failed files are retried.
 */

/** Longest edge kept after downscaling. 3072px still shows hairline cracks and fastener detail when zoomed. */
export const PHOTO_MAX_EDGE = 3072
/** Photos at or below this size are uploaded untouched. */
export const PHOTO_DOWNSCALE_MIN_BYTES = 3 * 1024 * 1024
export const PHOTO_QUALITY = 0.9

/** Only lossy formats are re-encoded; PNG (often screenshots or plans) and HEIC are uploaded as taken. */
const DOWNSCALABLE_TYPES = new Set(['image/jpeg', 'image/webp'])

export function canDownscale(mimeType: string): boolean {
  return DOWNSCALABLE_TYPES.has(mimeType)
}

export function shouldDownscale(photo: { type: string; size: number; width: number; height: number }): boolean {
  return canDownscale(photo.type) && photo.size > PHOTO_DOWNSCALE_MIN_BYTES && Math.max(photo.width, photo.height) > PHOTO_MAX_EDGE
}

export function targetDimensions(width: number, height: number, maxEdge: number = PHOTO_MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxEdge || longest <= 0) return { width, height }
  const scale = maxEdge / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export type UploadOutcome = { ok: true } | { ok: false; reason: string; retryable: boolean }
export type UploadFailure<T> = { item: T; reason: string; retryable: boolean }
export type UploadBatchResult<T> = { uploaded: T[]; failed: UploadFailure<T>[] }

/**
 * Uploads items one at a time (phones on job-site connections do better with one request in flight) and keeps
 * going after a failure, so every photo that can be saved is saved. A thrown error counts as a retryable failure.
 */
export async function runUploadBatch<T>(
  items: readonly T[],
  upload: (item: T, index: number) => Promise<UploadOutcome>,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadBatchResult<T>> {
  const uploaded: T[] = []
  const failed: UploadFailure<T>[] = []
  for (const [index, item] of items.entries()) {
    onProgress?.(index, items.length)
    let outcome: UploadOutcome
    try {
      outcome = await upload(item, index)
    } catch {
      outcome = { ok: false, reason: 'The connection dropped during upload.', retryable: true }
    }
    if (outcome.ok) uploaded.push(item)
    else failed.push({ item, reason: outcome.reason, retryable: outcome.retryable })
  }
  onProgress?.(items.length, items.length)
  return { uploaded, failed }
}

/** Items worth sending again. Files rejected for type or size are left out: retrying them cannot succeed. */
export function retryableItems<T>(failed: readonly UploadFailure<T>[]): T[] {
  return failed.filter((f) => f.retryable).map((f) => f.item)
}

export function uploadSummary(uploaded: number, failed: number, noun = 'photo'): string {
  const plural = (n: number) => `${n} ${noun}${n === 1 ? '' : 's'}`
  if (!failed) return `${plural(uploaded)} added.`
  if (!uploaded) return `${plural(failed)} could not be uploaded.`
  return `${plural(uploaded)} added. ${plural(failed)} could not be uploaded.`
}
