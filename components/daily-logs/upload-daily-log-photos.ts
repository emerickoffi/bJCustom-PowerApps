'use client'

import { preparePhotoForUpload } from '@/components/shared/prepare-photo'
import { runUploadBatch, type UploadBatchResult, type UploadOutcome } from '@/lib/photo-upload'
import { createClient } from '@/lib/supabase/client'
import { MEDIA_BUCKET, safeFileName } from '@/lib/walkthroughs'
import { DAILY_LOG_PHOTO_MAX_BYTES, DAILY_LOG_PHOTO_TYPES, dailyLogPhotoPath } from '@/lib/daily-logs'
import { registerDailyLogPhotoAction } from '@/app/actions/daily-logs'

const ALLOWED = new Set<string>(DAILY_LOG_PHOTO_TYPES)

/**
 * Uploads photos to a saved log: private Storage object first, then the registered record. A rejected
 * registration removes its object, so a failed photo never leaves an orphan and can be retried safely.
 */
export function uploadDailyLogPhotos(
  projectId: string,
  logId: string,
  files: File[],
  captionFor: (file: File) => string,
  onProgress?: (done: number, total: number) => void,
): Promise<UploadBatchResult<File>> {
  const supabase = createClient()
  return runUploadBatch(
    files,
    async (original): Promise<UploadOutcome> => {
      if (!ALLOWED.has(original.type)) return { ok: false, reason: `${original.name}: use JPEG, PNG, WebP or HEIC.`, retryable: false }
      const file = await preparePhotoForUpload(original)
      if (file.size > DAILY_LOG_PHOTO_MAX_BYTES) return { ok: false, reason: `${file.name}: larger than 15 MB.`, retryable: false }
      const path = dailyLogPhotoPath(logId, `${crypto.randomUUID()}-${safeFileName(file.name)}`)
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (error) return { ok: false, reason: `${file.name} could not be uploaded.`, retryable: true }
      const result = await registerDailyLogPhotoAction({
        project_id: projectId,
        log_id: logId,
        storage_path: path,
        file_name: file.name.slice(0, 200),
        mime_type: file.type as (typeof DAILY_LOG_PHOTO_TYPES)[number],
        size_bytes: file.size,
        caption: captionFor(original),
      })
      if (result.error) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path])
        return { ok: false, reason: `${file.name}: ${result.error}`, retryable: true }
      }
      return { ok: true }
    },
    onProgress,
  )
}
