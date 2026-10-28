'use client'

import { Suspense, use, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Archive,
  ArchiveRestore,
  Download,
  Eye,
  EyeOff,
  FileImage,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NativeSelect } from '@/components/shared/form-field'
import {
  getDocumentFileUrl,
  getDocumentHistory,
  setDocumentArchived,
  setDocumentVisibility,
  updateDocumentDetails,
  type DocumentVersionEntry,
} from '@/app/actions/documents'
import { DocumentUploadDialog } from '@/components/documents/document-upload-dialog'
import { categoriesFor, categoryLabel, fileTypeLabel, formatBytes, type AnyDocumentCategory, type DocumentRow } from '@/lib/documents'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

/** project: one project's files. company: project files across projects. library: Company Library (no project). */
export type LibraryMode = 'project' | 'company' | 'library' | 'portal'

type LibraryProps = {
  rows: DocumentRow[]
  mode: LibraryMode
  /** Staff who can upload and edit (any project-assigned staff). */
  canEdit: boolean
  /** Admins and project managers: sharing and archiving. */
  canManage: boolean
  people: Record<string, string>
  projectId?: string
  archivedView?: boolean
}

function FileIcon({ contentType, className }: { contentType?: string | null; className?: string }) {
  const Icon = contentType?.startsWith('image/') ? FileImage : FileText
  return <Icon className={className} aria-hidden="true" />
}

function VisibilityBadge({ visibility }: { visibility: DocumentRow['visibility'] }) {
  const shared = visibility === 'homeowner'
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        shared ? 'bg-[#EAF0E9] text-primary ring-primary/15' : 'bg-[#F8F7F3] text-muted-foreground ring-[#E2E8E2]',
      )}
    >
      {shared ? <Eye className="size-3" aria-hidden="true" /> : <EyeOff className="size-3" aria-hidden="true" />}
      {shared ? 'Shared' : 'Internal'}
    </span>
  )
}

async function openDownload(versionId: string) {
  const res = await getDocumentFileUrl(versionId, 'download')
  if (!res.ok) return toast.error(res.error)
  window.location.assign(res.data.url)
}

export function DocumentLibrary({ rows, mode, canEdit, canManage, people, projectId, archivedView }: LibraryProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [preview, setPreviewState] = useState<PreviewState | null>(null)
  const [history, setHistoryState] = useState<HistoryState | null>(null)
  const [editing, setEditing] = useState<DocumentRow | null>(null)
  const [versionFor, setVersionFor] = useState<DocumentRow | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<DocumentRow | null>(null)
  const staff = mode !== 'portal'
  const showVisibility = staff && mode !== 'library'
  const showProject = mode === 'company'

  function setPreview(doc: DocumentRow) {
    if (doc.current_version) setPreviewState({ doc, request: getDocumentFileUrl(doc.current_version.id, 'preview') })
  }
  function setHistory(doc: DocumentRow) {
    setHistoryState({ doc, request: getDocumentHistory(doc.id) })
  }

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const res = await action()
      if (!res.ok) toast.error(res.error ?? 'Something went wrong.')
      else {
        toast.success(success)
        router.refresh()
      }
    })
  }

  function actionsFor(doc: DocumentRow) {
    const version = doc.current_version
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-[#EAF0E9] hover:text-primary aria-expanded:bg-[#EAF0E9] disabled:opacity-50"
          aria-label={`Actions for ${doc.name}`}
          disabled={pending}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {version && (
            <>
              <DropdownMenuItem onClick={() => setPreview(doc)}>
                <Eye aria-hidden="true" /> Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void openDownload(version.id)}>
                <Download aria-hidden="true" /> Download
              </DropdownMenuItem>
            </>
          )}
          {staff && (
            <DropdownMenuItem onClick={() => setHistory(doc)}>
              <History aria-hidden="true" /> Version history
            </DropdownMenuItem>
          )}
          {staff && canEdit && !doc.archived_at && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setVersionFor(doc)}>
                <Upload aria-hidden="true" /> Upload new version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(doc)}>
                <Pencil aria-hidden="true" /> Edit details
              </DropdownMenuItem>
            </>
          )}
          {staff && canManage && (
            <>
              <DropdownMenuSeparator />
              {!doc.archived_at && doc.scope === 'project' && (
                <DropdownMenuItem
                  onClick={() =>
                    run(
                      () => setDocumentVisibility(doc.id, doc.visibility === 'homeowner' ? 'internal' : 'homeowner'),
                      doc.visibility === 'homeowner' ? 'Document is now internal only' : 'Document shared with the homeowner',
                    )
                  }
                >
                  {doc.visibility === 'homeowner' ? <EyeOff aria-hidden="true" /> : <Share2 aria-hidden="true" />}
                  {doc.visibility === 'homeowner' ? 'Make internal' : 'Share with homeowner'}
                </DropdownMenuItem>
              )}
              {doc.archived_at ? (
                <DropdownMenuItem onClick={() => run(() => setDocumentArchived(doc.id, false), 'Document restored')}>
                  <ArchiveRestore aria-hidden="true" /> Restore
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmArchive(doc)}>
                  <Archive aria-hidden="true" /> Archive
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  function nameCell(doc: DocumentRow) {
    return (
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EAF0E9] text-primary">
          <FileIcon contentType={doc.current_version?.content_type} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => setPreview(doc)}
            className="w-fit max-w-full truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {doc.name}
          </button>
          {doc.description && <p className="line-clamp-1 text-xs text-muted-foreground">{doc.description}</p>}
          {showProject && (
            <p className="text-xs text-muted-foreground md:hidden">
              <span className="font-medium text-foreground/70">Project: </span>
              {projectLink(doc)}
            </p>
          )}
        </div>
      </div>
    )
  }

  function projectLink(doc: DocumentRow) {
    if (!doc.project) return <span>Unavailable</span>
    return (
      <Link
        href={`/projects/${doc.project.id}/documents`}
        className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
      >
        {doc.project.name}
        {doc.project.project_number && <span className="font-normal text-muted-foreground">{` · ${doc.project.project_number}`}</span>}
      </Link>
    )
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-[#E2E8E2] bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Documents</caption>
          <thead className="bg-[#F8F7F3] text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">Document</th>
              {showProject && <th scope="col" className="px-4 py-3">Project</th>}
              <th scope="col" className="px-4 py-3">Category</th>
              {showVisibility && <th scope="col" className="px-4 py-3">Visibility</th>}
              <th scope="col" className="px-4 py-3">Version</th>
              <th scope="col" className="px-4 py-3">{staff ? 'Updated' : 'Added'}</th>
              <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8E2]">
            {rows.map((doc) => (
              <tr key={doc.id} className="align-top transition-colors hover:bg-[#F8F7F3]/60">
                <td className="max-w-md px-4 py-3">{nameCell(doc)}</td>
                {showProject && <td className="max-w-56 px-4 py-3 text-sm">{projectLink(doc)}</td>}
                <td className="px-4 py-3 text-muted-foreground">{categoryLabel(doc.category)}</td>
                {showVisibility && (
                  <td className="px-4 py-3">
                    <VisibilityBadge visibility={doc.visibility} />
                  </td>
                )}
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="text-foreground">{`v${doc.current_version_number}`}</span>
                  <span className="block text-xs">
                    {[fileTypeLabel(doc.current_version?.content_type), formatBytes(doc.current_version?.size_bytes)].join(' · ')}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="text-foreground">{formatDate(staff ? doc.updated_at : doc.current_version?.uploaded_at)}</span>
                  {staff && doc.current_version && (
                    <span className="block text-xs">{people[doc.current_version.uploaded_by] ?? 'Team member'}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">{actionsFor(doc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((doc) => (
          <li key={doc.id} className="rounded-xl border border-[#E2E8E2] bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              {nameCell(doc)}
              {actionsFor(doc)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-12 text-xs text-muted-foreground">
              {showVisibility && <VisibilityBadge visibility={doc.visibility} />}
              <span>{categoryLabel(doc.category)}</span>
              <span>{`v${doc.current_version_number} · ${fileTypeLabel(doc.current_version?.content_type)} · ${formatBytes(doc.current_version?.size_bytes)}`}</span>
              <span>{formatDate(staff ? doc.updated_at : doc.current_version?.uploaded_at)}</span>
            </div>
          </li>
        ))}
      </ul>

      <PreviewDialog state={preview} onRetry={() => preview && setPreview(preview.doc)} onClose={() => setPreviewState(null)} />
      {staff && <HistoryDialog state={history} onClose={() => setHistoryState(null)} />}
      {staff && <EditDialog doc={editing} onClose={() => setEditing(null)} />}
      {staff && projectId !== undefined && (
        <DocumentUploadDialog
          projectId={versionFor?.project_id ?? projectId}
          open={Boolean(versionFor)}
          onOpenChange={(o) => !o && setVersionFor(null)}
          canShare={canManage}
          version={versionFor ? { documentId: versionFor.id, name: versionFor.name, currentVersion: versionFor.current_version_number } : null}
        />
      )}
      {staff && projectId === undefined && versionFor && (
        <DocumentUploadDialog
          projectId={versionFor.project_id ?? undefined}
          scope={versionFor.scope}
          open
          onOpenChange={(o) => !o && setVersionFor(null)}
          canShare={canManage}
          version={{ documentId: versionFor.id, name: versionFor.name, currentVersion: versionFor.current_version_number }}
        />
      )}

      <Dialog open={Boolean(confirmArchive)} onOpenChange={(o) => !o && setConfirmArchive(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">Archive this document?</DialogTitle>
            <DialogDescription>
              {`${confirmArchive?.name ?? 'This document'} will be hidden from the active library${
                confirmArchive?.visibility === 'homeowner' ? ' and no longer shared with the homeowner' : ''
              }. Every version is kept, and you can restore it from Archived documents.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmArchive(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                const doc = confirmArchive
                setConfirmArchive(null)
                if (doc) run(() => setDocumentArchived(doc.id, true), 'Document archived')
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {archivedView && <span className="sr-only">Showing archived documents</span>}
    </>
  )
}

type FileUrlResult = Awaited<ReturnType<typeof getDocumentFileUrl>>
type HistoryResult = Awaited<ReturnType<typeof getDocumentHistory>>
type PreviewState = { doc: DocumentRow; request: Promise<FileUrlResult> }
type HistoryState = { doc: DocumentRow; request: Promise<HistoryResult> }

function DialogSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-32 flex-1 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label={label} />
    </div>
  )
}

function PreviewDialog({ state, onRetry, onClose }: { state: PreviewState | null; onRetry: () => void; onClose: () => void }) {
  const doc = state?.doc
  const version = doc?.current_version ?? null
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[calc(100svh-2rem)] max-h-[900px] flex-col gap-3 sm:max-w-5xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="truncate font-serif text-lg">{doc?.name ?? 'Preview'}</DialogTitle>
          <DialogDescription>
            {version ? `Version ${doc?.current_version_number} · ${version.original_filename} · ${formatBytes(version.size_bytes)}` : ''}
          </DialogDescription>
        </DialogHeader>
        {state && version && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[#E2E8E2] bg-[#F8F7F3]">
              <Suspense fallback={<DialogSpinner label="Loading preview" />}>
                <PreviewBody request={state.request} contentType={version.content_type} name={state.doc.name} onRetry={onRetry} />
              </Suspense>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => void openDownload(version.id)}>
                <Download data-icon="inline-start" /> Download
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PreviewBody({
  request,
  contentType,
  name,
  onRetry,
}: {
  request: Promise<FileUrlResult>
  contentType: string
  name: string
  onRetry: () => void
}) {
  const res = use(request)
  const [expired, setExpired] = useState(false)
  if (!res.ok || expired)
    return (
      <div className="flex max-w-sm flex-col items-center gap-3 p-6 text-center text-sm text-muted-foreground">
        <p role="alert">{res.ok ? 'The preview link expired. Load it again.' : res.error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" /> Try again
        </Button>
      </div>
    )
  return contentType === 'application/pdf' ? (
    <iframe src={res.data.url} title={`Preview of ${name}`} className="size-full bg-white" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not optimizable
    <img src={res.data.url} alt={name} className="max-h-full max-w-full object-contain" onError={() => setExpired(true)} />
  )
}

function HistoryDialog({ state, onClose }: { state: HistoryState | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(state)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Version history</DialogTitle>
          <DialogDescription>{state?.doc.name}</DialogDescription>
        </DialogHeader>
        {state && (
          <Suspense fallback={<DialogSpinner label="Loading history" />}>
            <HistoryBody request={state.request} currentVersion={state.doc.current_version_number} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  )
}

function HistoryBody({ request, currentVersion }: { request: Promise<HistoryResult>; currentVersion: number }) {
  const res = use(request)
  if (!res.ok)
    return (
      <p role="alert" className="py-8 text-center text-sm text-muted-foreground">
        {res.error}
      </p>
    )
  return (
    <ol className="flex flex-col divide-y divide-[#E2E8E2] rounded-lg border border-[#E2E8E2]">
      {res.data.map((v: DocumentVersionEntry) => (
        <li key={v.id} className="flex items-start justify-between gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {`Version ${v.versionNumber}`}
              {v.versionNumber === currentVersion && (
                <span className="rounded-full bg-[#EAF0E9] px-2 py-0.5 text-xs font-medium text-primary">Current</span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{`${v.originalFilename} · ${formatBytes(v.sizeBytes)}`}</p>
            <p className="text-xs text-muted-foreground">{`${v.uploadedBy} · ${formatDateTime(v.uploadedAt)}`}</p>
            {v.revisionNotes && <p className="mt-1 text-sm text-foreground">{v.revisionNotes}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={() => void openDownload(v.id)} aria-label={`Download version ${v.versionNumber}`}>
            <Download />
          </Button>
        </li>
      ))}
    </ol>
  )
}

function EditDialog({ doc, onClose }: { doc: DocumentRow | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif text-lg">Edit document details</DialogTitle>
          <DialogDescription>Changes are recorded in the audit log. File versions are not affected.</DialogDescription>
        </DialogHeader>
        {doc && <EditForm key={doc.id} doc={doc} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ doc, onDone }: { doc: DocumentRow; onDone: () => void }) {
  const router = useRouter()
  const [name, setName] = useState(doc.name)
  const [category, setCategory] = useState<AnyDocumentCategory>(doc.category)
  const [description, setDescription] = useState(doc.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Enter a document name.')
        startTransition(async () => {
          const res = await updateDocumentDetails({ documentId: doc.id, name, category, description: description || undefined })
          if (!res.ok) return setError(res.error)
          toast.success('Document updated')
          onDone()
          router.refresh()
        })
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="doc-edit-name" className="text-sm font-medium">Document name</label>
        <input
          id="doc-edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
          className="h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="doc-edit-category" className="text-sm font-medium">Category</label>
        <NativeSelect id="doc-edit-category" value={category} onChange={(e) => setCategory(e.target.value as AnyDocumentCategory)}>
          {categoriesFor(doc.scope).map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="doc-edit-description" className="text-sm font-medium">
          Description <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="doc-edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </form>
  )
}
