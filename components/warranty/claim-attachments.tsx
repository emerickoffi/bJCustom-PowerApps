'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, FileText, ImageIcon, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export const MAX_ATTACHMENTS = 6
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf'

export type ClaimAttachment = {
  key: string
  file: File
  previewUrl: string | null
}

type Rejection = { name: string; reason: string }

/** Some browsers report HEIC/HEIF photos with an empty or `image/heif` type; store them under the accepted HEIC type. */
function normalize(file: File): File {
  const heic = /\.(heic|heif)$/i.test(file.name)
  if (heic && (file.type === '' || file.type === 'image/heif')) return new File([file], file.name, { type: 'image/heic', lastModified: file.lastModified })
  return file
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** `resetKey` clears the selection whenever it changes, e.g. after a successful save. */
export function useClaimAttachments(resetKey: number = 0) {
  const [items, setItems] = useState<ClaimAttachment[]>([])
  const [rejections, setRejections] = useState<Rejection[]>([])
  const [seenKey, setSeenKey] = useState(resetKey)
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setItems([])
    setRejections([])
  }
  const itemsRef = useRef(items)
  itemsRef.current = items
  const previous = useRef(items)
  useEffect(() => {
    const kept = new Set(items.map((i) => i.key))
    previous.current.forEach((i) => !kept.has(i.key) && i.previewUrl && URL.revokeObjectURL(i.previewUrl))
    previous.current = items
  }, [items])

  useEffect(() => () => itemsRef.current.forEach((i) => i.previewUrl && URL.revokeObjectURL(i.previewUrl)), [])

  function add(fileList: FileList | null) {
    const files = Array.from(fileList ?? [])
    if (!files.length) return
    const next = [...itemsRef.current]
    const rejected: Rejection[] = []
    for (const raw of files) {
      const file = normalize(raw)
      if (!ALLOWED_TYPES.has(file.type)) rejected.push({ name: file.name, reason: 'is not a JPG, PNG, WebP, HEIC or PDF file.' })
      else if (file.size > MAX_ATTACHMENT_BYTES) rejected.push({ name: file.name, reason: `is ${formatBytes(file.size)}; the limit is 15 MB.` })
      else if (next.length >= MAX_ATTACHMENTS) rejected.push({ name: file.name, reason: `was not added; the limit is ${MAX_ATTACHMENTS} files.` })
      else {
        const previewable = file.type.startsWith('image/')
        next.push({ key: crypto.randomUUID(), file, previewUrl: previewable ? URL.createObjectURL(file) : null })
      }
    }
    setItems(next)
    setRejections(rejected)
  }

  function remove(key: string) {
    setItems(itemsRef.current.filter((i) => i.key !== key))
    setRejections([])
  }

  /** Adds the selected files to an outgoing FormData, each paired with its stable retry key. */
  function appendTo(formData: FormData) {
    formData.delete('photos')
    formData.delete('photo_keys')
    for (const item of itemsRef.current) {
      formData.append('photos', item.file, item.file.name)
      formData.append('photo_keys', item.key)
    }
  }

  return { items, rejections, add, remove, appendTo, clearRejections: () => setRejections([]) }
}

export type ClaimAttachmentsController = ReturnType<typeof useClaimAttachments>

export function ClaimAttachments({
  controller,
  label = 'Photos & documents (optional)',
  disabled,
  idPrefix,
}: {
  controller: ClaimAttachmentsController
  label?: string
  disabled?: boolean
  idPrefix: string
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const { items, rejections, add, remove, clearRejections } = controller
  const full = items.length >= MAX_ATTACHMENTS
  const labelId = `${idPrefix}-attachments-label`
  const hintId = `${idPrefix}-attachments-hint`

  function handle(input: HTMLInputElement) {
    add(input.files)
    // Reset so selecting the same file again (or cancelling) never leaves stale state behind.
    input.value = ''
  }

  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hintId} className="flex flex-col gap-2">
      <span id={labelId} className="text-sm font-medium leading-none">
        {label}
      </span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={disabled || full}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera data-icon="inline-start" aria-hidden="true" />
          Take photo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full sm:w-auto"
          disabled={disabled || full}
          onClick={() => uploadRef.current?.click()}
        >
          <Upload data-icon="inline-start" aria-hidden="true" />
          Upload photos or PDF
        </Button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => handle(e.currentTarget)}
        />
        <input
          ref={uploadRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => handle(e.currentTarget)}
        />
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        {`Up to ${MAX_ATTACHMENTS} files, 15 MB each. JPG, PNG, WebP, HEIC or PDF. `}
        Take photo opens the camera on phones and tablets; on a computer it lets you choose an image.
        {items.length > 0 && ` ${items.length} of ${MAX_ATTACHMENTS} selected.`}
      </p>

      {rejections.length > 0 && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <ul className="flex flex-col gap-0.5 text-xs text-destructive">
            {rejections.map((r, i) => (
              <li key={`${r.name}-${i}`}>
                <span className="font-medium">{r.name}</span> {r.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearRejections}
            className="shrink-0 rounded text-destructive hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss file errors"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {items.length > 0 && (
        <ul aria-label="Selected attachments" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <AttachmentTile key={item.key} item={item} disabled={disabled} onRemove={() => remove(item.key)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function AttachmentTile({ item, disabled, onRemove }: { item: ClaimAttachment; disabled?: boolean; onRemove: () => void }) {
  const [previewFailed, setPreviewFailed] = useState(false)
  const isPdf = item.file.type === 'application/pdf'
  const showImage = item.previewUrl && !previewFailed
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview before upload
          <img src={item.previewUrl!} alt="" className="size-full object-cover" onError={() => setPreviewFailed(true)} />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
            {isPdf ? <FileText className="size-7" aria-hidden="true" /> : <ImageIcon className="size-7" aria-hidden="true" />}
            <span className="text-[11px] font-medium uppercase tracking-wide">
              {isPdf ? 'PDF' : item.file.type === 'image/heic' ? 'HEIC · no preview' : 'Image'}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="absolute right-1.5 top-1.5 flex size-8 items-center justify-center rounded-full bg-foreground/80 text-background transition-opacity hover:bg-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          aria-label={`Remove ${item.file.name}`}
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col px-2 py-1.5">
        <span className="truncate text-xs font-medium" title={item.file.name}>
          {item.file.name}
        </span>
        <span className="text-[11px] text-muted-foreground">{formatBytes(item.file.size)}</span>
      </div>
    </li>
  )
}
