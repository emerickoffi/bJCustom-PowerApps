'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { MAX_MEDIA_BYTES, MEDIA_BUCKET, mediaKindFor, safeFileName, type MediaItem, type MediaKind } from '@/lib/walkthroughs'

export type MediaMeta = {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  media_kind: MediaKind
}

type MediaUploaderProps = {
  items: MediaItem[]
  onItemsChange: (items: MediaItem[]) => void
  pathFor: (fileName: string) => string
  register: (meta: MediaMeta) => Promise<{ id?: string; error?: string }>
  unregister?: (item: MediaItem) => Promise<string | null>
  disabled?: boolean
  label?: string
}

export function MediaUploader({
  items,
  onItemsChange,
  pathFor,
  register,
  unregister,
  disabled,
  label = 'Photos & video (optional)',
}: MediaUploaderProps) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    setError(null)
    const supabase = createClient()
    let current = items
    const failures: string[] = []

    for (const [index, file] of files.entries()) {
      setProgress(`Uploading ${index + 1} of ${files.length}...`)
      const kind = mediaKindFor(file.type)
      if (!kind) {
        failures.push(`${file.name} is not a photo or video.`)
        continue
      }
      if (file.size > MAX_MEDIA_BYTES) {
        failures.push(`${file.name} is larger than 50 MB.`)
        continue
      }
      const fileName = safeFileName(file.name)
      const path = pathFor(`${crypto.randomUUID()}-${fileName}`)
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        failures.push(`${file.name} could not be uploaded.`)
        continue
      }
      const result = await register({
        storage_path: path,
        file_name: file.name.slice(0, 200),
        mime_type: file.type,
        size_bytes: file.size,
        media_kind: kind,
      })
      if (!result.id) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path])
        failures.push(result.error ?? `${file.name} could not be saved.`)
        continue
      }
      const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60 * 60)
      current = [
        ...current,
        { id: result.id, storage_path: path, file_name: file.name, media_kind: kind, url: signed?.signedUrl ?? null },
      ]
      onItemsChange(current)
    }

    setProgress(null)
    if (failures.length) setError(failures.join(' '))
    if (cameraRef.current) cameraRef.current.value = ''
    if (libraryRef.current) libraryRef.current.value = ''
  }

  async function handleRemove(item: MediaItem) {
    if (!unregister) return
    setRemoving(item.id)
    const failure = await unregister(item)
    setRemoving(null)
    if (failure) setError(failure)
    else onItemsChange(items.filter((i) => i.id !== item.id))
  }

  const busy = Boolean(progress) || disabled

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full sm:w-auto"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera data-icon="inline-start" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full sm:w-auto"
          disabled={busy}
          onClick={() => libraryRef.current?.click()}
        >
          <ImagePlus data-icon="inline-start" />
          Add photos or video
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {progress && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <li key={item.id} className="relative">
              <MediaThumb item={item} />
              {unregister && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  disabled={removing === item.id || busy}
                  className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-foreground/80 text-background transition-opacity hover:bg-foreground disabled:opacity-50"
                  aria-label={`Remove ${item.file_name}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function MediaThumb({ item }: { item: MediaItem }) {
  const frame = 'aspect-square w-full overflow-hidden rounded-lg border bg-muted'
  if (!item.url) {
    return (
      <div className={`${frame} flex items-center justify-center p-2 text-center text-xs text-muted-foreground`}>
        {item.file_name}
      </div>
    )
  }
  if (item.media_kind === 'video') {
    return (
      <div className={`${frame} relative`}>
        <video src={item.url} className="size-full object-cover" controls preload="metadata" aria-label={item.file_name} />
        <Video className="pointer-events-none absolute left-1.5 top-1.5 size-4 text-background drop-shadow" aria-hidden="true" />
      </div>
    )
  }
  return (
    <a href={item.url} target="_blank" rel="noreferrer" className={`${frame} block`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are short-lived */}
      <img src={item.url} alt={item.file_name} className="size-full object-cover" />
    </a>
  )
}

export function MediaGrid({ items, emptyLabel }: { items: MediaItem[]; emptyLabel: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <li key={item.id}>
          <MediaThumb item={item} />
        </li>
      ))}
    </ul>
  )
}
