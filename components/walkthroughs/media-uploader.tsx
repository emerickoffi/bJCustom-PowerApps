'use client'

import { useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, ImagePlus, Loader2, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useFloatingCameraTarget } from '@/components/camera/floating-camera'
import { createClient } from '@/lib/supabase/client'
import { MAX_MEDIA_BYTES, MEDIA_BUCKET, mediaKindFor, safeFileName, type MediaItem, type MediaKind } from '@/lib/walkthroughs'

export type EvidenceKind = 'original' | 'supplemental' | 'repair'

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
  evidence?: EvidenceKind
  bucket?: string
  /** Opt-in destination name for the floating camera shortcut, e.g. "Repair photos". */
  floatingCameraLabel?: string
}

export function MediaUploader({
  items,
  onItemsChange,
  pathFor,
  register,
  unregister,
  disabled,
  label = 'Photos & video (optional)',
  evidence,
  bucket = MEDIA_BUCKET,
  floatingCameraLabel,
}: MediaUploaderProps) {
  const preview = usePhotoIndex(items)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const inlineRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState<string | null>(null)
  useFloatingCameraTarget({
    label: floatingCameraLabel,
    enabled: !disabled,
    disabled: Boolean(progress),
    camera: cameraRef,
    gallery: libraryRef,
    inline: inlineRef,
  })
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
        .from(bucket)
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
        await supabase.storage.from(bucket).remove([path])
        failures.push(result.error ?? `${file.name} could not be saved.`)
        continue
      }
      const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60)
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
      <div ref={inlineRef} className="flex flex-col gap-2 sm:flex-row">
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
              <MediaThumb item={item} evidence={evidence} onOpen={() => preview.openFor(item)} />
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
      <MediaLightbox items={items} index={preview.index} evidence={evidence} onIndexChange={preview.setIndex} />
    </div>
  )
}

const EVIDENCE = {
  original: { chip: 'Before', title: 'Original issue photo', className: 'bg-warning text-warning-foreground', frame: 'border-warning/60' },
  supplemental: { chip: 'Added', title: 'Supplemental issue photo', className: 'bg-accent text-accent-foreground', frame: 'border-accent' },
  repair: { chip: 'After', title: 'Repair photo', className: 'bg-primary text-primary-foreground', frame: 'border-primary/60' },
} as const

export function MediaThumb({
  item,
  evidence,
  onOpen,
}: {
  item: MediaItem
  evidence?: EvidenceKind
  onOpen?: () => void
}) {
  const tone = evidence ? EVIDENCE[evidence] : null
  const frame = cn('relative aspect-square w-full overflow-hidden rounded-lg border bg-muted', tone?.frame)
  const chip = tone && (
    <span className={cn('pointer-events-none absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tone.className)}>
      {tone.chip}
    </span>
  )
  if (!item.url) {
    return (
      <div className={cn(frame, 'flex items-center justify-center p-2 text-center text-xs text-muted-foreground')}>
        {item.file_name}
        {chip}
      </div>
    )
  }
  if (item.media_kind === 'video') {
    return (
      <div className={frame}>
        <video src={item.url} className="size-full object-cover" controls preload="metadata" aria-label={item.file_name} />
        <Video className="pointer-events-none absolute left-1.5 top-1.5 size-4 text-background drop-shadow" aria-hidden="true" />
        {chip}
      </div>
    )
  }
  const label = `View ${tone ? `${tone.title.toLowerCase()} ` : ''}${item.file_name} full size`
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className={cn(frame, 'block cursor-zoom-in outline-none focus-visible:ring-3 focus-visible:ring-ring/50')}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are short-lived */}
      <img src={item.url} alt="" className="size-full object-cover" />
      {chip}
    </button>
  )
}

function MediaLightbox({
  items,
  index,
  evidence,
  onIndexChange,
}: {
  items: MediaItem[]
  index: number | null
  evidence?: EvidenceKind
  onIndexChange: (index: number | null) => void
}) {
  const photos = items.filter((i) => i.media_kind === 'photo' && i.url)
  const current = index === null ? null : photos[index]
  const tone = evidence ? EVIDENCE[evidence] : null
  const step = (delta: number) => index !== null && onIndexChange((index + delta + photos.length) % photos.length)
  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        className="max-w-[calc(100%-1rem)] gap-3 p-3 sm:max-w-4xl"
        onKeyDown={(e) => {
          if (photos.length < 2) return
          if (e.key === 'ArrowRight') step(1)
          if (e.key === 'ArrowLeft') step(-1)
        }}
      >
        <DialogHeader className="pr-10">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-sm">
            {tone && <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', tone.className)}>{tone.chip}</span>}
            <span className="min-w-0 truncate">{current?.file_name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">
            {`${tone?.title ?? 'Photo'}${photos.length > 1 && index !== null ? ` · ${index + 1} of ${photos.length}` : ''}`}
          </DialogDescription>
        </DialogHeader>
        {current?.url && (
          <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are short-lived */}
            <img src={current.url} alt={current.file_name} className="max-h-[75vh] w-auto object-contain" />
          </div>
        )}
        {photos.length > 1 && (
          <div className="flex justify-between gap-2">
            <Button type="button" variant="outline" onClick={() => step(-1)}>
              <ChevronLeft data-icon="inline-start" />
              Previous
            </Button>
            <Button type="button" variant="outline" onClick={() => step(1)}>
              Next
              <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function usePhotoIndex(items: MediaItem[]) {
  const [index, setIndex] = useState<number | null>(null)
  const photos = items.filter((i) => i.media_kind === 'photo' && i.url)
  const openFor = (item: MediaItem) => {
    const at = photos.findIndex((p) => p.id === item.id)
    if (at >= 0) setIndex(at)
  }
  return { index, setIndex, openFor }
}

export function MediaGrid({ items, emptyLabel, evidence }: { items: MediaItem[]; emptyLabel: string; evidence?: EvidenceKind }) {
  const { index, setIndex, openFor } = usePhotoIndex(items)
  if (!items.length) return emptyLabel ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null
  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <MediaThumb item={item} evidence={evidence} onOpen={() => openFor(item)} />
          </li>
        ))}
      </ul>
      <MediaLightbox items={items} index={index} evidence={evidence} onIndexChange={setIndex} />
    </>
  )
}
