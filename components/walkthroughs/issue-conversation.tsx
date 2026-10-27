'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ImagePlus, Loader2, MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { addIssueCommentAction } from '@/app/actions/walkthroughs'
import { MediaGrid } from '@/components/walkthroughs/media-uploader'
import { formatDateTime } from '@/lib/format'
import { MAX_MEDIA_BYTES, MEDIA_BUCKET, mediaKindFor, safeFileName, type MediaItem } from '@/lib/walkthroughs'
import { cn } from '@/lib/utils'

export type ConversationMessage = {
  id: string
  body: string
  author: string
  fromBuilder: boolean
  createdAt: string
  photos: MediaItem[]
}

const MAX_COMMENT_PHOTOS = 10

export function IssueConversation({ messages, emptyLabel }: { messages: ConversationMessage[]; emptyLabel: string }) {
  if (!messages.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <MessageSquare className="size-4 shrink-0" aria-hidden="true" />
        {emptyLabel}
      </p>
    )
  }
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            'flex flex-col gap-2 rounded-lg border p-4',
            m.fromBuilder ? 'border-primary/20 bg-primary/5' : 'bg-muted/40',
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-medium text-foreground">{m.author}</span>
            <time dateTime={m.createdAt} className="text-xs text-muted-foreground">
              {formatDateTime(m.createdAt)}
            </time>
          </div>
          <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{m.body}</p>
          {m.photos.length > 0 && <MediaGrid items={m.photos} emptyLabel="" />}
        </li>
      ))}
    </ol>
  )
}

export function HomeownerCommentForm({
  issueId,
  organizationId,
  userId,
}: {
  issueId: string
  organizationId: string
  userId: string
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const fieldId = `comment-${issueId}`

  function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? [])
    const rejected: string[] = []
    const valid = picked.filter((f) => {
      if (mediaKindFor(f.type) !== 'photo') {
        rejected.push(`${f.name} is not a photo.`)
        return false
      }
      if (f.size > MAX_MEDIA_BYTES) {
        rejected.push(`${f.name} is larger than 50 MB.`)
        return false
      }
      return true
    })
    const next = [...files, ...valid].slice(0, MAX_COMMENT_PHOTOS)
    if (files.length + valid.length > MAX_COMMENT_PHOTOS) rejected.push(`You can attach up to ${MAX_COMMENT_PHOTOS} photos.`)
    setFiles(next)
    setError(rejected.length ? rejected.join(' ') : null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (!body.trim()) {
      setError('Write a comment first.')
      return
    }
    setPending(true)
    setError(null)
    setSuccess(null)

    const result = await addIssueCommentAction(issueId, body)
    if (!result.noteId) {
      setError(result.error ?? 'Your comment could not be sent.')
      setPending(false)
      return
    }

    const supabase = createClient()
    const failures: string[] = []
    for (const file of files) {
      const path = `issues/${issueId}/feedback/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        failures.push(file.name)
        continue
      }
      const { error: insertError } = await supabase.from('issue_attachments').insert({
        organization_id: organizationId,
        issue_id: issueId,
        note_id: result.noteId,
        attachment_kind: 'feedback',
        uploaded_by: userId,
        storage_path: path,
        file_name: file.name.slice(0, 200),
        mime_type: file.type,
        size_bytes: file.size,
        media_kind: 'photo',
      })
      if (insertError) {
        await supabase.storage.from(MEDIA_BUCKET).remove([path])
        failures.push(file.name)
      }
    }

    setBody('')
    setFiles([])
    setPending(false)
    if (failures.length) {
      setError(`Your comment was sent, but ${failures.length === 1 ? 'one photo' : `${failures.length} photos`} could not be attached: ${failures.join(', ')}.`)
    } else {
      setSuccess('Comment sent. Your builder has been notified.')
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        Add a comment for your builder
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        rows={3}
        disabled={pending}
        placeholder="Ask a question or describe what you are still seeing."
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
      />

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Photos to attach">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex max-w-full items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2.5 pr-1 text-xs text-foreground">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles(files.filter((_, i) => i !== index))}
                disabled={pending}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
                <span className="sr-only">{`Remove ${file.name}`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" id={`${fieldId}-photos`} onChange={(e) => addFiles(e.target.files)} disabled={pending} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={pending || files.length >= MAX_COMMENT_PHOTOS}>
            <ImagePlus aria-hidden="true" />
            Attach photos
          </Button>
        </div>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? 'Sending...' : 'Send comment'}
        </Button>
      </div>

      <div aria-live="polite" className="text-sm">
        {error && <p className="text-destructive">{error}</p>}
        {success && <p className="text-primary">{success}</p>}
      </div>
    </form>
  )
}
