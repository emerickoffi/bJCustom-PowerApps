'use client'

import { useId, useRef, useState } from 'react'
import { Camera, FileText, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { discardDocumentUpload, prepareDocumentUpload, registerDocumentVersion } from '@/app/actions/documents'
import { DOCUMENT_ACCEPT, DOCUMENTS_BUCKET, validateDocumentFile } from '@/lib/documents'
import { Button } from '@/components/ui/button'

async function uploadObject(path: string, file: File, token: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, '')
  const res = await fetch(`${base}/storage/v1/object/${DOCUMENTS_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      'Content-Type': file.type,
      'x-upsert': 'false',
    },
    body: file,
  })
  if (!res.ok) throw new Error('The file could not be uploaded. Check your connection and try again.')
}

/**
 * Uploads the vendor invoice through the existing secure document pipeline (server-issued path,
 * signature check, internal visibility) and submits only the resulting document id with the bill.
 */
export function InvoiceAttachmentField({
  projectId,
  vendorName,
  initial,
  error,
  onBusyChange,
}: {
  projectId: string
  vendorName: string
  initial: { documentId: string; name: string } | null
  error?: string
  onBusyChange: (busy: boolean) => void
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [attached, setAttached] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file || busy) return
    const invalid = validateDocumentFile(file)
    if (invalid) return setProblem(invalid)
    setProblem(null)
    setBusy(true)
    onBusyChange(true)
    let path: string | null = null
    try {
      const prepared = await prepareDocumentUpload({ projectId, contentType: file.type, size: file.size })
      if (!prepared.ok) throw new Error(prepared.error)
      path = prepared.data.path
      const { data: auth } = await createClient().auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error('Your session has expired. Sign in again to upload.')
      await uploadObject(path, file, token)
      const name = `Vendor invoice${vendorName.trim() ? ` - ${vendorName.trim()}` : ''}`.slice(0, 200)
      const saved = await registerDocumentVersion({ path, originalFilename: file.name, name, category: 'other', visibility: 'internal' })
      path = null
      if (!saved.ok) throw new Error(saved.error)
      setAttached({ documentId: saved.data.documentId, name: file.name })
    } catch (err) {
      if (path) void discardDocumentUpload(path)
      setProblem(err instanceof Error ? err.message : 'The upload failed. Please try again.')
    } finally {
      setBusy(false)
      onBusyChange(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const shownError = problem ?? error
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-foreground" id={`${inputId}-label`}>
        Invoice copy <span className="font-normal text-muted-foreground">(optional)</span>
      </span>
      <input type="hidden" name="attachment_document_id" value={attached?.documentId ?? ''} />
      {attached ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 px-3 py-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{attached.name}</span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setAttached(null)} aria-label="Remove attached invoice">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="sr-only"
            aria-labelledby={`${inputId}-label`}
            onChange={(e) => void pick(e.target.files?.[0])}
            disabled={busy}
          />
          <Button type="button" variant="outline" className="h-11 justify-start gap-2" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" aria-hidden="true" />}
            {busy ? 'Uploading invoice...' : 'Take photo or choose file'}
          </Button>
          <p className="text-xs text-muted-foreground">PDF, JPEG, PNG or WebP. Stored privately with the project documents.</p>
        </>
      )}
      {shownError && (
        <p role="alert" className="text-xs text-destructive">
          {shownError}
        </p>
      )}
    </div>
  )
}
