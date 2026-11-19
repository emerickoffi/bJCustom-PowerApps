'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, ImagePlus, X } from 'lucide-react'
import { DAILY_LOG_PHOTO_LIMIT, DAILY_LOG_PHOTO_TYPES } from '@/lib/daily-logs'
import {
  commitPendingPhotos,
  discardPendingPhotos,
  onPendingPhotosTaken,
  stagePendingPhotos,
  uncommitPendingPhotos,
  type PendingDailyLogPhoto,
} from '@/lib/daily-log-pending-photos'
import { useUnsavedNavigationGuard } from '@/components/app/navigation-guard'
import { useFloatingCameraTarget } from '@/components/camera/floating-camera'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const ALLOWED = new Set<string>(DAILY_LOG_PHOTO_TYPES)
const LEAVE_PROMPT = 'Photos you added have not been uploaded yet. Leave this page and discard them?'

type Item = PendingDailyLogPhoto & { url: string }

/**
 * Collects site photos while the log is being written. Files stay in this tab's memory until the draft
 * saves; the saved log page then uploads them, so no Storage object exists without a saved log.
 */
export function PendingPhotoPicker({
  projectId,
  logId,
  existingCount = 0,
  disabled,
  saveFailed,
}: {
  projectId: string
  logId: string | null
  existingCount?: number
  disabled: boolean
  /** Changes after each failed save so a rejected submit releases the batch again. */
  saveFailed: unknown
}) {
  const [items, setItems] = useState<Item[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const inlineRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const remaining = Math.max(0, DAILY_LOG_PHOTO_LIMIT - existingCount - items.length)

  useFloatingCameraTarget({
    label: 'Daily log photos',
    enabled: remaining > 0,
    disabled,
    camera: cameraRef,
    gallery: galleryRef,
    inline: inlineRef,
  })
  useUnsavedNavigationGuard(items.length > 0, LEAVE_PROMPT)

  useEffect(() => {
    stagePendingPhotos(
      projectId,
      logId,
      items.map(({ id, file, caption }) => ({ id, file, caption })),
    )
  }, [items, projectId, logId])

  // Saved offline: the photos now live in the field outbox, so the previews (and the leave warning) go away.
  useEffect(
    () =>
      onPendingPhotosTaken((taken) => {
        if (taken !== projectId) return
        itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url))
        setItems([])
      }),
    [projectId],
  )

  // Mark the batch for hand-off whenever this form submits (Save draft or the floating camera).
  useEffect(() => {
    const form = galleryRef.current?.form
    if (!form) return
    const onSubmit = () => commitPendingPhotos()
    form.addEventListener('submit', onSubmit)
    return () => form.removeEventListener('submit', onSubmit)
  }, [])

  useEffect(() => {
    if (saveFailed) uncommitPendingPhotos()
  }, [saveFailed])

  useEffect(() => {
    if (!items.length) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [items.length])

  useEffect(
    () => () => {
      itemsRef.current.forEach((i) => URL.revokeObjectURL(i.url))
      discardPendingPhotos(projectId)
    },
    [projectId],
  )

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? [])
    if (cameraRef.current) cameraRef.current.value = ''
    if (galleryRef.current) galleryRef.current.value = ''
    if (!picked.length) return
    const valid = picked.filter((f) => ALLOWED.has(f.type))
    const accepted = valid.slice(0, remaining)
    const notes: string[] = []
    if (valid.length < picked.length) notes.push('Some files were skipped. Use JPEG, PNG, WebP or HEIC.')
    if (accepted.length < valid.length) notes.push(`Only ${DAILY_LOG_PHOTO_LIMIT} photos can be attached to one log.`)
    setNotice(notes.length ? notes.join(' ') : null)
    if (!accepted.length) return
    setItems((prev) => [...prev, ...accepted.map((file) => ({ id: crypto.randomUUID(), file, caption: '', url: URL.createObjectURL(file) }))])
  }

  function remove(id: string) {
    setItems((prev) => {
      const gone = prev.find((i) => i.id === id)
      if (gone) URL.revokeObjectURL(gone.url)
      return prev.filter((i) => i.id !== id)
    })
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      {items.length > 0 && <input type="hidden" name="intent" value="photos" />}
      <div ref={inlineRef} className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <p className="text-sm text-pretty text-muted-foreground">
          {items.length
            ? `${items.length} photo${items.length === 1 ? '' : 's'} ready. They upload privately to this project when you save the draft. Keep this page open until then.`
            : 'Take or choose photos now. They upload privately to this project when you save the draft.'}
        </p>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={() => cameraRef.current?.click()} disabled={disabled || remaining <= 0} className="h-12 w-full sm:h-10 sm:w-auto">
            <Camera aria-hidden="true" />
            Take photo
          </Button>
          <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()} disabled={disabled || remaining <= 0} className="h-12 w-full sm:h-10 sm:w-auto">
            <ImagePlus aria-hidden="true" />
            Upload photos
          </Button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept={DAILY_LOG_PHOTO_TYPES.join(',')}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => addFiles(e.target.files)}
        />
        <input
          ref={galleryRef}
          type="file"
          accept={DAILY_LOG_PHOTO_TYPES.join(',')}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, i) => (
            <li key={item.id} className="flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
              <div className="relative aspect-[4/3] bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                <img src={item.url} alt={item.caption || `Photo ${i + 1} to upload`} className="size-full object-cover" />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => remove(item.id)}
                  disabled={disabled}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute top-1.5 right-1.5 size-8 bg-background/90 shadow-xs"
                >
                  <X aria-hidden="true" />
                </Button>
              </div>
              <label className="sr-only" htmlFor={`pending-caption-${item.id}`}>
                {`Caption for photo ${i + 1}`}
              </label>
              <Input
                id={`pending-caption-${item.id}`}
                value={item.caption}
                onChange={(e) => {
                  const caption = e.target.value
                  setItems((prev) => prev.map((p) => (p.id === item.id ? { ...p, caption } : p)))
                }}
                maxLength={300}
                placeholder="Add a caption"
                className="h-9 rounded-none border-0 border-t border-border/60 text-sm shadow-none focus-visible:ring-inset"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
