'use client'

import { useState, useTransition } from 'react'
import { FileText, Loader2, Paperclip, X } from 'lucide-react'
import { getRfiAttachmentUrlAction, getRfiDocumentUrlAction } from '@/app/actions/rfis'
import { formatFileSize } from '@/lib/rfis'

type Target = { kind: 'attachment'; path: string } | { kind: 'document'; rfiId: string }

/** Opens a private file through a one-minute signed link. Access is decided on the server each time it is clicked. */
function SignedFileButton({ target, label, meta }: { target: Target; label: string; meta?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <span className="flex min-w-0 flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = target.kind === 'attachment' ? await getRfiAttachmentUrlAction(target.path) : await getRfiDocumentUrlAction(target.rfiId)
            if (!r.ok) setError(r.error)
            else window.open(r.url, '_blank', 'noopener,noreferrer')
          })
        }
        className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-sm text-left text-sm font-medium text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : target.kind === 'attachment' ? (
          <Paperclip className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <FileText className="size-4 shrink-0" aria-hidden="true" />
        )}
        <span className="break-all">{label}</span>
        {meta && <span className="shrink-0 text-xs font-normal text-muted-foreground">{meta}</span>}
        <span className="sr-only"> (opens in a new tab)</span>
      </button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}

export function RfiFileList({
  files,
  onRemove,
  removing = false,
}: {
  files: { id: string; storage_path: string; file_name: string; size_bytes: number }[]
  /** Only offered where a file can still be taken back: on a draft, or before an answer is submitted. */
  onRemove?: (file: { id: string; storage_path: string; file_name: string }) => void
  removing?: boolean
}) {
  if (files.length === 0) return null
  return (
    <ul className="flex flex-col">
      {files.map((file) => (
        <li key={file.id} className="flex min-w-0 items-start justify-between gap-2">
          <SignedFileButton target={{ kind: 'attachment', path: file.storage_path }} label={file.file_name} meta={formatFileSize(file.size_bytes)} />
          {onRemove && (
            <button
              type="button"
              disabled={removing}
              onClick={() => onRemove(file)}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-50"
            >
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">{`Remove ${file.file_name}`}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The referenced document version. The label is always shown; the file opens only for people who may already open it. */
export function RfiDocumentLink({ rfiId, label }: { rfiId: string; label: string }) {
  return <SignedFileButton target={{ kind: 'document', rfiId }} label={label} />
}
