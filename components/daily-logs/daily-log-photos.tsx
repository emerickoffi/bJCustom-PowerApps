'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MEDIA_BUCKET, safeFileName } from '@/lib/walkthroughs'
import { DAILY_LOG_PHOTO_LIMIT, DAILY_LOG_PHOTO_MAX_BYTES, DAILY_LOG_PHOTO_TYPES, dailyLogPhotoPath } from '@/lib/daily-logs'
import { registerDailyLogPhotoAction, removeDailyLogPhotoAction, updateDailyLogPhotoCaptionAction } from '@/app/actions/daily-logs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DailyLogPhoto } from '@/lib/daily-logs-data'

const ALLOWED = new Set<string>(DAILY_LOG_PHOTO_TYPES)

export function DailyLogPhotos({ projectId, logId, photos, editable }: { projectId: string; logId: string; photos: DailyLogPhoto[]; editable: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'status'; text: string } | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const remaining = DAILY_LOG_PHOTO_LIMIT - photos.length
  const busy = uploading || remaining <= 0

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    const list = Array.from(files).slice(0, remaining)
    const failures: string[] = []
    setUploading(true)
    setMessage({ tone: 'status', text: `Uploading ${list.length} photo${list.length === 1 ? '' : 's'}...` })
    const supabase = createClient()
    for (const file of list) {
      if (!ALLOWED.has(file.type)) {
        failures.push(`${file.name}: use JPEG, PNG, WebP or HEIC.`)
        continue
      }
      if (file.size > DAILY_LOG_PHOTO_MAX_BYTES) {
        failures.push(`${file.name}: larger than 15 MB.`)
        continue
      }
      const path = dailyLogPhotoPath(logId, `${crypto.randomUUID()}-${safeFileName(file.name)}`)
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (error) {
        failures.push(`${file.name} could not be uploaded.`)
        continue
      }
      const result = await registerDailyLogPhotoAction({
        project_id: projectId,
        log_id: logId,
        storage_path: path,
        file_name: file.name.slice(0, 200),
        mime_type: file.type as (typeof DAILY_LOG_PHOTO_TYPES)[number],
        size_bytes: file.size,
        caption: '',
      })
      if (result.error) failures.push(`${file.name}: ${result.error}`)
    }
    if (Array.from(files).length > list.length) failures.push(`Only ${DAILY_LOG_PHOTO_LIMIT} photos can be attached to one log.`)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
    setMessage(failures.length ? { tone: 'error', text: failures.join(' ') } : { tone: 'status', text: 'Photos added.' })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" onClick={() => cameraRef.current?.click()} disabled={busy} className="h-12 w-full sm:h-11 sm:w-auto">
              {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Camera aria-hidden="true" />}
              Take Photo
            </Button>
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy} className="h-12 w-full sm:h-11 sm:w-auto">
              <ImagePlus aria-hidden="true" />
              Upload Photos
            </Button>
            <input
              ref={cameraRef}
              type="file"
              accept={DAILY_LOG_PHOTO_TYPES.join(',')}
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={busy}
            />
            <input
              ref={inputRef}
              type="file"
              accept={DAILY_LOG_PHOTO_TYPES.join(',')}
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              id="daily-log-photo-input"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={busy}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {remaining > 0
              ? `${photos.length} of ${DAILY_LOG_PHOTO_LIMIT} photos attached, 15 MB each. Stored privately with this project.`
              : `This log has reached the ${DAILY_LOG_PHOTO_LIMIT}-photo limit. Remove a photo to add another.`}
          </p>
        </div>
      )}
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {message.text}
        </p>
      )}
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos attached.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <PhotoCard key={photo.id} projectId={projectId} logId={logId} photo={photo} editable={editable} />
          ))}
        </ul>
      )}
    </div>
  )
}

function PhotoCard({ projectId, logId, photo, editable }: { projectId: string; logId: string; photo: DailyLogPhoto; editable: boolean }) {
  const router = useRouter()
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const ref = { project_id: projectId, log_id: logId, photo_id: photo.id }

  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
      <div className="aspect-[4/3] bg-muted">
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are short-lived
          <img src={photo.url} alt={photo.caption || `Site photo ${photo.file_name}`} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">Preview unavailable</div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-3">
        {editable ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              startTransition(async () => {
                const r = await updateDailyLogPhotoCaptionAction({ ...ref, caption })
                setError(r.error ?? null)
                if (!r.error) router.refresh()
              })
            }}
          >
            <label className="sr-only" htmlFor={`caption-${photo.id}`}>
              Caption
            </label>
            <Input id={`caption-${photo.id}`} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={300} placeholder="Add a caption" className="h-10" />
            <Button type="submit" variant="outline" size="sm" className="h-10" disabled={pending || caption === (photo.caption ?? '')}>
              Save
            </Button>
          </form>
        ) : (
          photo.caption && <p className="text-sm text-foreground">{photo.caption}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">{photo.file_name}</p>
          {editable && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove ${photo.file_name}`}
              disabled={pending}
              onClick={() => {
                if (!window.confirm('Remove this photo from the log?')) return
                startTransition(async () => {
                  const r = await removeDailyLogPhotoAction(ref)
                  setError(r.error ?? null)
                  if (!r.error) router.refresh()
                })
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </li>
  )
}
