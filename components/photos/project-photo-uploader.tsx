'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, Loader2, RotateCcw } from 'lucide-react'
import { preparePhotoForUpload } from '@/components/shared/prepare-photo'
import { retryableItems, runUploadBatch, uploadSummary, type UploadOutcome } from '@/lib/photo-upload'
import { createClient } from '@/lib/supabase/client'
import { MEDIA_BUCKET, safeFileName } from '@/lib/walkthroughs'
import { PROJECT_PHOTO_MAX_BYTES, PROJECT_PHOTO_TYPES, projectPhotoStoragePath } from '@/lib/project-photos'
import { registerProjectPhotoAction } from '@/app/actions/project-photos'
import { Button } from '@/components/ui/button'

const ALLOWED = new Set<string>(PROJECT_PHOTO_TYPES)
const BATCH_LIMIT = 50

type Queued = { file: File; path: string }

export function ProjectPhotoUploader({ projectId }: { projectId: string }) {
  const router = useRouter()
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'status'; text: string } | null>(null)
  const [retry, setRetry] = useState<Queued[]>([])

  function queue(input: FileList | null): Queued[] {
    // The path is fixed per file before upload, so a retry reuses it and cannot create a duplicate.
    return Array.from(input ?? [])
      .slice(0, BATCH_LIMIT)
      .map((file) => ({ file, path: projectPhotoStoragePath(projectId, `${crypto.randomUUID()}-${safeFileName(file.name)}`) }))
  }

  async function upload(items: Queued[], skipped = 0) {
    if (galleryRef.current) galleryRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
    if (!items.length) return
    setUploading(true)
    setRetry([])
    setMessage({ tone: 'status', text: `Uploading 1 of ${items.length}...` })
    const supabase = createClient()
    const { uploaded, failed } = await runUploadBatch(
      items,
      async (item): Promise<UploadOutcome> => {
        if (!ALLOWED.has(item.file.type)) return { ok: false, reason: `${item.file.name}: use JPEG, PNG, WebP or HEIC.`, retryable: false }
        const file = await preparePhotoForUpload(item.file)
        if (file.size > PROJECT_PHOTO_MAX_BYTES) return { ok: false, reason: `${file.name}: larger than 15 MB.`, retryable: false }
        const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(item.path, file, { contentType: file.type, upsert: false })
        // An object already at this path means an earlier attempt uploaded it; registering is idempotent.
        const alreadyStored = error && /exists|duplicate/i.test(error.message)
        if (error && !alreadyStored) return { ok: false, reason: `${file.name} could not be uploaded.`, retryable: true }
        const result = await registerProjectPhotoAction({
          project_id: projectId,
          storage_path: item.path,
          file_name: file.name.slice(0, 200),
          mime_type: file.type as (typeof PROJECT_PHOTO_TYPES)[number],
          size_bytes: file.size,
        })
        if (result.error) return { ok: false, reason: `${file.name}: ${result.error}`, retryable: true }
        return { ok: true }
      },
      (done, total) => done < total && setMessage({ tone: 'status', text: `Uploading ${done + 1} of ${total}...` }),
    )
    const notes = failed.map((f) => f.reason)
    if (skipped) notes.push(`Upload up to ${BATCH_LIMIT} photos at a time.`)
    setUploading(false)
    setRetry(retryableItems(failed))
    setMessage(
      notes.length
        ? { tone: 'error', text: `${uploadSummary(uploaded.length, failed.length)} ${notes.join(' ')}` }
        : { tone: 'status', text: uploadSummary(uploaded.length, 0) },
    )
    if (uploaded.length) router.refresh()
  }

  function onPick(files: FileList | null) {
    const total = files?.length ?? 0
    void upload(queue(files), Math.max(0, total - BATCH_LIMIT))
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={() => cameraRef.current?.click()} disabled={uploading} className="h-11">
          {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
          Take Photo
        </Button>
        <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()} disabled={uploading} className="h-11">
          <ImagePlus aria-hidden="true" />
          Upload Photos
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept={PROJECT_PHOTO_TYPES.join(',')}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onPick(e.target.files)}
          disabled={uploading}
        />
        <input
          ref={galleryRef}
          type="file"
          accept={PROJECT_PHOTO_TYPES.join(',')}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onPick(e.target.files)}
          disabled={uploading}
        />
      </div>
      {message && (
        <div className="flex flex-col gap-2 sm:items-end">
          <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
            {message.text}
          </p>
          {retry.length > 0 && (
            <Button type="button" variant="outline" className="h-11" disabled={uploading} onClick={() => upload(retry)}>
              <RotateCcw aria-hidden="true" />
              {`Retry ${retry.length} ${retry.length === 1 ? 'photo' : 'photos'}`}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
