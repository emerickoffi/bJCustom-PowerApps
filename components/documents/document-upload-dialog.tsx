'use client'

import { useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileUp, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/shared/form-field'
import { createClient } from '@/lib/supabase/client'
import { discardDocumentUpload, prepareDocumentUpload, registerDocumentVersion } from '@/app/actions/documents'
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_CATEGORIES,
  DOCUMENT_TYPES_HINT,
  DOCUMENTS_BUCKET,
  formatBytes,
  validateDocumentFile,
  type DocumentCategory,
} from '@/lib/documents'
import { cn } from '@/lib/utils'

type NewVersionTarget = { documentId: string; name: string; currentVersion: number }

type UploadDialogProps = {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  canShare: boolean
  /** When set, the dialog uploads the next version of this document instead of creating a new one. */
  version?: NewVersionTarget | null
  defaultCategory?: DocumentCategory
}

function displayNameFromFile(filename: string) {
  return filename.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200)
}

function uploadWithProgress(path: string, file: File, token: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')
    xhr.open('POST', `${base}/storage/v1/object/${DOCUMENTS_BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))))
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(file)
  })
}

export function DocumentUploadDialog({ projectId, open, onOpenChange, canShare, version, defaultCategory }: UploadDialogProps) {
  const router = useRouter()
  const ids = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory ?? 'other')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'internal' | 'homeowner'>('internal')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  function reset() {
    setFile(null)
    setName('')
    setCategory(defaultCategory ?? 'other')
    setDescription('')
    setVisibility('internal')
    setNotes('')
    setError(null)
    setProgress(null)
  }

  function pick(next: File | undefined) {
    if (!next) return
    const problem = validateDocumentFile(next)
    setError(problem)
    if (problem) return
    setFile(next)
    if (!version && !name) setName(displayNameFromFile(next.name))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!file) return setError('Choose a file to upload.')
    const problem = validateDocumentFile(file)
    if (problem) return setError(problem)
    if (!version && !name.trim()) return setError('Enter a document name.')

    setBusy(true)
    setError(null)
    setProgress(0)
    let path: string | null = null
    try {
      const prepared = await prepareDocumentUpload({ projectId, documentId: version?.documentId, contentType: file.type, size: file.size })
      if (!prepared.ok) throw new Error(prepared.error)
      path = prepared.data.path

      const { data: auth } = await createClient().auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error('Your session has expired. Sign in again to upload.')
      try {
        await uploadWithProgress(path, file, token, setProgress)
      } catch {
        throw new Error('The file could not be uploaded. Check your connection and try again.')
      }

      const saved = await registerDocumentVersion({
        path,
        originalFilename: file.name,
        name: version ? undefined : name.trim(),
        category: version ? undefined : category,
        description: version ? undefined : description.trim() || undefined,
        visibility: version ? 'internal' : visibility,
        revisionNotes: notes.trim() || undefined,
      })
      path = null
      if (!saved.ok) throw new Error(saved.error)

      toast.success(version ? `Version ${saved.data.versionNumber} uploaded` : 'Document uploaded')
      reset()
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      if (path) void discardDocumentUpload(path)
      setError(err instanceof Error ? err.message : 'The upload failed. Please try again.')
      setProgress(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">{version ? 'Upload new version' : 'Upload document'}</DialogTitle>
          <DialogDescription>
            {version
              ? `${version.name} is on version ${version.currentVersion}. Earlier versions are kept in the history.`
              : 'New documents are internal until you share them with the homeowner.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              if (!busy) pick(e.dataTransfer.files?.[0])
            }}
            className={cn(
              'flex flex-col items-center gap-3 rounded-xl border border-dashed bg-[#F8F7F3] px-4 py-6 text-center transition-colors',
              dragging ? 'border-primary bg-[#EAF0E9]' : 'border-[#E2E8E2]',
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-white text-primary ring-1 ring-inset ring-primary/10">
              <FileUp className="size-5" aria-hidden="true" />
            </span>
            {file ? (
              <div className="flex max-w-full items-center gap-2 text-sm">
                <span className="truncate font-medium text-foreground">{file.name}</span>
                <span className="shrink-0 text-muted-foreground">{formatBytes(file.size)}</span>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Remove selected file"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Drag a file here, or</p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
              {file ? 'Choose a different file' : 'Choose file'}
            </Button>
            <input
              ref={inputRef}
              id={`${ids}-file`}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="sr-only"
              aria-label="Document file"
              onChange={(e) => {
                pick(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <p className="text-xs text-muted-foreground">{DOCUMENT_TYPES_HINT}</p>
          </div>

          {!version && (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${ids}-name`} className="text-sm font-medium">
                  Document name
                </label>
                <input
                  id={`${ids}-name`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  required
                  disabled={busy}
                  className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${ids}-category`} className="text-sm font-medium">
                    Category
                  </label>
                  <NativeSelect
                    id={`${ids}-category`}
                    value={category}
                    onChange={(e) => setCategory(e.target.value as DocumentCategory)}
                    disabled={busy}
                  >
                    {DOCUMENT_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={`${ids}-visibility`} className="text-sm font-medium">
                    Visibility
                  </label>
                  <NativeSelect
                    id={`${ids}-visibility`}
                    value={visibility}
                    onChange={(e) => setVisibility(e.target.value as 'internal' | 'homeowner')}
                    disabled={busy || !canShare}
                  >
                    <option value="internal">Internal only</option>
                    {canShare && <option value="homeowner">Shared with homeowner</option>}
                  </NativeSelect>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${ids}-description`} className="text-sm font-medium">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id={`${ids}-description`}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={2000}
                  rows={2}
                  disabled={busy}
                  className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${ids}-notes`} className="text-sm font-medium">
              Revision notes <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <input
              id={`${ids}-notes`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
              placeholder={version ? 'What changed in this version?' : 'For example, original drawing'}
              disabled={busy}
              className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {progress !== null && (
            <div className="flex flex-col gap-1.5" aria-live="polite">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{progress < 100 ? 'Uploading' : 'Saving document'}</span>
                <span>{`${progress}%`}</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[#EAF0E9]"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Upload progress"
              >
                <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !file}>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Upload data-icon="inline-start" />}
              {busy ? 'Uploading' : version ? 'Upload version' : 'Upload document'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
