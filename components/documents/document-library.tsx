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
  FileSignature,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Share2,
  Upload,
  X,
} from 'lucide-react'
import { PanelSection, RecordPanel } from '@/components/shared/record-panel'
import { DetailList } from '@/components/shared/page-header'
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
import { SignatureBadge } from '@/components/signatures/signature-badge'
import { SignatureDialog, openSignatureState, type SignatureDialogState } from '@/components/signatures/signature-dialog'
import type { SignatureSummary } from '@/lib/signatures'

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
  /** Staff project view only. enabled: the e_signatures feature is on. */
  signatures?: { enabled: boolean; summaries: Record<string, SignatureSummary> }
  /** Denser desktop table: Document, Category, Updated, Visibility; version details move under the name. */
  compact?: boolean
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
        'inline-flex w-fit items-center gap-1 rounded-badge px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        shared ? 'bg-interactive-soft text-primary ring-primary/15' : 'bg-[#F3F4F6] text-muted-foreground ring-[#D6DDE5]',
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

export function DocumentLibrary({ rows, mode, canEdit, canManage, people, projectId, archivedView, signatures, compact = false }: LibraryProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [signing, setSigning] = useState<SignatureDialogState | null>(null)
  const [preview, setPreviewState] = useState<PreviewState | null>(null)
  const [history, setHistoryState] = useState<HistoryState | null>(null)
  const [editing, setEditing] = useState<DocumentRow | null>(null)
  const [versionFor, setVersionFor] = useState<DocumentRow | null>(null)
  const [confirmArchive, setConfirmArchive] = useState<DocumentRow | null>(null)
  const staff = mode !== 'portal'
  const showVisibility = staff && mode !== 'library'
  const showProject = mode === 'company'

  const [inspectId, setInspectId] = useState<string | null>(null)
  const [inspectReq, setInspectReq] = useState<InspectRequests | null>(null)
  const inspecting = inspectId ? rows.find((r) => r.id === inspectId) ?? null : null

  const selectable = staff && canManage
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkConfirmArchive, setBulkConfirmArchive] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const selectedRows = rows.filter((r) => selected.has(r.id))
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAllShown() {
    setSelected(allShownSelected ? new Set() : new Set(rows.map((r) => r.id)))
  }

  async function runBulk(label: string, docs: DocumentRow[], op: (doc: DocumentRow) => Promise<{ ok: boolean; error?: string }>) {
    setBulkRunning(true)
    setBulkResult(null)
    const failed: BulkResult['failed'] = []
    let done = 0
    for (const doc of docs) {
      const res = await op(doc).catch(() => ({ ok: false, error: 'Network error. Try again.' }))
      if (res.ok) done += 1
      else failed.push({ id: doc.id, name: doc.name, error: res.error ?? 'Something went wrong.' })
    }
    setBulkRunning(false)
    setBulkResult({ label, done, failed })
    setSelected(new Set(failed.map((f) => f.id)))
    if (failed.length === 0) toast.success(`${label}: ${done} ${done === 1 ? 'document' : 'documents'} updated`)
    else toast.error(`${label}: ${failed.length} of ${docs.length} failed`)
    if (done > 0) router.refresh()
  }

  function openRecord(doc: DocumentRow) {
    if (!staff) return setPreview(doc)
    setInspectId(doc.id)
    setInspectReq({
      preview: doc.current_version ? getDocumentFileUrl(doc.current_version.id, 'preview') : null,
      history: getDocumentHistory(doc.id),
    })
  }
  /** Closes the panel before opening a dialog, so drawers and dialogs never stack. */
  function handoff(fn: () => void) {
    setInspectId(null)
    fn()
  }

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
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-interactive-soft hover:text-primary aria-expanded:bg-interactive-soft disabled:opacity-50"
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
          {staff && signatures && doc.scope === 'project' && (signatures.summaries[doc.id] || (signatures.enabled && version?.content_type === 'application/pdf')) && (
            <DropdownMenuItem onClick={() => setSigning(openSignatureState({ id: doc.id, name: doc.name }))}>
              <FileSignature aria-hidden="true" /> {signatures.summaries[doc.id] ? 'View signing progress' : 'Request signatures'}
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
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-interactive-soft text-primary">
          <FileIcon contentType={doc.current_version?.content_type} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => openRecord(doc)}
            className="w-fit max-w-full truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {doc.name}
          </button>
          {doc.description && <p className="line-clamp-1 text-xs text-muted-foreground">{doc.description}</p>}
          {signatures?.summaries[doc.id] && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => setSigning(openSignatureState({ id: doc.id, name: doc.name }))}
                className="w-fit rounded-badge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Signature status for ${doc.name}`}
              >
                <SignatureBadge
                  status={signatures.summaries[doc.id].status}
                  signed={signatures.summaries[doc.id].signed}
                  total={signatures.summaries[doc.id].total}
                />
              </button>
              {signatures.summaries[doc.id].status === 'completed' && (
                <span className="text-xs text-muted-foreground">
                  {signatures.summaries[doc.id].hasSignedPdf ? 'Signed PDF available' : 'Signed PDF synchronization pending'}
                </span>
              )}
            </div>
          )}
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

  function compactNameCell(doc: DocumentRow) {
    return (
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-interactive-soft text-primary">
          <FileIcon contentType={doc.current_version?.content_type} className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => openRecord(doc)}
            className="block max-w-full truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {doc.name}
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {[`v${doc.current_version_number}`, fileTypeLabel(doc.current_version?.content_type), formatBytes(doc.current_version?.size_bytes)].join(' · ')}
          </p>
          {signatures?.summaries[doc.id] && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <button
                type="button"
                onClick={() => setSigning(openSignatureState({ id: doc.id, name: doc.name }))}
                className="w-fit rounded-badge focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Signature status for ${doc.name}`}
              >
                <SignatureBadge
                  status={signatures.summaries[doc.id].status}
                  signed={signatures.summaries[doc.id].signed}
                  total={signatures.summaries[doc.id].total}
                />
              </button>
              {signatures.summaries[doc.id].status === 'completed' && (
                <span className="text-xs text-muted-foreground">
                  {signatures.summaries[doc.id].hasSignedPdf ? 'Signed PDF available' : 'Signed PDF synchronization pending'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const selectAllBox = (
    <input
      type="checkbox"
      aria-label={allShownSelected ? 'Deselect all shown documents' : `Select all ${rows.length} shown documents`}
      checked={allShownSelected}
      onChange={toggleAllShown}
      disabled={bulkRunning || rows.length === 0}
      className="size-4 accent-primary"
    />
  )
  function rowBox(doc: DocumentRow) {
    return (
      <input
        type="checkbox"
        aria-label={`Select ${doc.name}`}
        checked={selected.has(doc.id)}
        onChange={() => toggleSelected(doc.id)}
        disabled={bulkRunning}
        className="size-4 accent-primary"
      />
    )
  }

  const compactTable = (
    <div className="hidden overflow-x-auto rounded-xl border border-[#D6DDE5] bg-card md:block">
      <table className="w-full text-sm">
        <caption className="sr-only">Documents</caption>
        <thead className="border-b border-[#D6DDE5] bg-table-head text-left text-xs font-medium text-[#526173]">
          <tr>
            {selectable && <th scope="col" className="w-10 py-2.5 pr-0 pl-4">{selectAllBox}</th>}
            <th scope="col" className="px-4 py-2.5">Document</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5">Category</th>
            <th scope="col" className="whitespace-nowrap px-4 py-2.5">Updated</th>
            {showVisibility && <th scope="col" className="whitespace-nowrap px-4 py-2.5">Visibility</th>}
            <th scope="col" className="w-12 px-2 py-2.5"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#D6DDE5]">
          {rows.map((doc) => (
            <tr key={doc.id} className={cn('align-top transition-colors hover:bg-link-soft/60', selected.has(doc.id) && 'bg-link-soft/40')}>
              {selectable && <td className="w-10 py-3 pr-0 pl-4">{rowBox(doc)}</td>}
              {/* w-full + max-w-0 lets the name column absorb remaining width and truncate instead of widening the page. */}
              <td className="w-full max-w-0 px-4 py-2.5">{compactNameCell(doc)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{categoryLabel(doc.category)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                <span className="text-foreground">{formatDate(staff ? doc.updated_at : doc.current_version?.uploaded_at)}</span>
                {staff && doc.current_version && (
                  <span className="block text-xs">{people[doc.current_version.uploaded_by] ?? 'Team member'}</span>
                )}
              </td>
              {showVisibility && (
                <td className="whitespace-nowrap px-4 py-2.5">
                  <VisibilityBadge visibility={doc.visibility} />
                </td>
              )}
              <td className="px-2 py-1.5 text-right">{actionsFor(doc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const libraryScope = mode === 'library'
  const shareable = selectedRows.filter((d) => d.scope === 'project' && !d.archived_at && d.visibility !== 'homeowner')
  const internalizable = selectedRows.filter((d) => d.scope === 'project' && !d.archived_at && d.visibility === 'homeowner')
  const archivable = selectedRows.filter((d) => !d.archived_at)
  const restorable = selectedRows.filter((d) => d.archived_at)
  const skippedNote = (eligible: number, verb: string, why: string) =>
    eligible < selectedRows.length ? `${selectedRows.length - eligible} selected can't be ${verb}: ${why}.` : null
  const bulkNotes = [
    !archivedView && !libraryScope && skippedNote(shareable.length, 'shared', 'already shared or archived'),
    !archivedView && !libraryScope && skippedNote(internalizable.length, 'made internal', 'already internal or archived'),
    'Download, editing, and new versions work one document at a time from each row menu.',
  ].filter(Boolean) as string[]

  return (
    <>
      {selectable && selectedRows.length > 0 && (
        <div
          role="region"
          aria-label="Bulk document actions"
          className="sticky top-2 z-10 mb-3 flex flex-col gap-2 rounded-xl border border-primary/30 bg-card px-3 py-2.5 shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground" aria-live="polite">
              {`${selectedRows.length} selected`}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={bulkRunning}>
              <X data-icon="inline-start" />
              Clear selection
            </Button>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {bulkRunning && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Working" />}
              {!archivedView && !libraryScope && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bulkRunning || shareable.length === 0}
                    onClick={() => void runBulk('Shared with homeowner', shareable, (d) => setDocumentVisibility(d.id, 'homeowner'))}
                  >
                    <Share2 data-icon="inline-start" />
                    {`Share (${shareable.length})`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={bulkRunning || internalizable.length === 0}
                    onClick={() => void runBulk('Made internal', internalizable, (d) => setDocumentVisibility(d.id, 'internal'))}
                  >
                    <EyeOff data-icon="inline-start" />
                    {`Make internal (${internalizable.length})`}
                  </Button>
                </>
              )}
              {restorable.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkRunning}
                  onClick={() => void runBulk('Restored', restorable, (d) => setDocumentArchived(d.id, false))}
                >
                  <ArchiveRestore data-icon="inline-start" />
                  {`Restore (${restorable.length})`}
                </Button>
              )}
              {archivable.length > 0 && (
                <Button type="button" variant="destructive" size="sm" disabled={bulkRunning} onClick={() => setBulkConfirmArchive(true)}>
                  <Archive data-icon="inline-start" />
                  {`Archive (${archivable.length})`}
                </Button>
              )}
            </div>
          </div>
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {bulkNotes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {bulkResult && bulkResult.failed.length > 0 && (
        <div role="alert" className="mb-3 flex flex-col gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-foreground">
              {`${bulkResult.label}: ${bulkResult.done} succeeded, ${bulkResult.failed.length} failed. Failed documents stay selected so you can retry.`}
            </p>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setBulkResult(null)}>
              <X />
            </Button>
          </div>
          <ul className="flex flex-col gap-1 text-muted-foreground">
            {bulkResult.failed.map((f) => (
              <li key={f.id}>
                <span className="font-medium text-foreground">{f.name}</span>
                {`: ${f.error}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {compact ? compactTable : (
      <div className="hidden overflow-hidden rounded-xl border border-[#D6DDE5] bg-card md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Documents</caption>
          <thead className="border-b border-[#D6DDE5] bg-table-head text-left text-xs font-medium text-[#526173]">
            <tr>
              {selectable && <th scope="col" className="w-10 py-3 pr-0 pl-4">{selectAllBox}</th>}
              <th scope="col" className="px-4 py-3">Document</th>
              {showProject && <th scope="col" className="px-4 py-3">Project</th>}
              <th scope="col" className="px-4 py-3">Category</th>
              {showVisibility && <th scope="col" className="px-4 py-3">Visibility</th>}
              <th scope="col" className="px-4 py-3">Version</th>
              <th scope="col" className="px-4 py-3">{staff ? 'Updated' : 'Added'}</th>
              <th scope="col" className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#D6DDE5]">
            {rows.map((doc) => (
              <tr key={doc.id} className={cn('align-top transition-colors hover:bg-link-soft/60', selected.has(doc.id) && 'bg-link-soft/40')}>
                {selectable && <td className="w-10 py-4 pr-0 pl-4">{rowBox(doc)}</td>}
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
      )}

      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((doc) => (
          <li key={doc.id} className={cn('rounded-xl border border-[#D6DDE5] bg-card p-4', selected.has(doc.id) && 'border-primary/40 bg-link-soft/40')}>
            <div className="flex items-start justify-between gap-2">
              {selectable && <span className="-ml-1 flex size-9 shrink-0 items-center justify-center">{rowBox(doc)}</span>}
              <div className="min-w-0 flex-1">{nameCell(doc)}</div>
              {actionsFor(doc)}
            </div>
            <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 pl-12 text-xs text-muted-foreground">
              {showVisibility && <VisibilityBadge visibility={doc.visibility} />}
              <span>{categoryLabel(doc.category)}</span>
              <span>{`v${doc.current_version_number} · ${fileTypeLabel(doc.current_version?.content_type)} · ${formatBytes(doc.current_version?.size_bytes)}`}</span>
              <span>{formatDate(staff ? doc.updated_at : doc.current_version?.uploaded_at)}</span>
            </div>
          </li>
        ))}
      </ul>

      {staff && (
        <DocumentPanel
          doc={inspecting}
          requests={inspectReq}
          people={people}
          showVisibility={showVisibility}
          canEdit={canEdit}
          canManage={canManage}
          pending={pending}
          onClose={() => setInspectId(null)}
          onRetryPreview={() => inspecting && openRecord(inspecting)}
          onFullPreview={(d) => handoff(() => setPreview(d))}
          onEdit={(d) => handoff(() => setEditing(d))}
          onNewVersion={(d) => handoff(() => setVersionFor(d))}
          onToggleShare={(d) =>
            run(
              () => setDocumentVisibility(d.id, d.visibility === 'homeowner' ? 'internal' : 'homeowner'),
              d.visibility === 'homeowner' ? 'Document is now internal only' : 'Document shared with the homeowner',
            )
          }
        />
      )}
      <Dialog open={bulkConfirmArchive} onOpenChange={setBulkConfirmArchive}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-lg">{`Archive ${archivable.length} ${archivable.length === 1 ? 'document' : 'documents'}?`}</DialogTitle>
            <DialogDescription>
              {`They will be hidden from the active library${
                archivable.some((d) => d.visibility === 'homeowner') ? ', and shared ones will no longer be visible to the homeowner' : ''
              }. Every version is kept, and you can restore them from Archived documents.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirmArchive(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setBulkConfirmArchive(false)
                void runBulk('Archived', archivable, (d) => setDocumentArchived(d.id, true))
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PreviewDialog state={preview} onRetry={() => preview && setPreview(preview.doc)} onClose={() => setPreviewState(null)} />
      {staff && <HistoryDialog state={history} onClose={() => setHistoryState(null)} />}
      {staff && signatures && <SignatureDialog state={signing} onChange={setSigning} onClose={() => setSigning(null)} />}
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
type InspectRequests = { preview: Promise<FileUrlResult> | null; history: Promise<HistoryResult> }
type BulkResult = { label: string; done: number; failed: { id: string; name: string; error: string }[] }

function DocumentPanel({
  doc,
  requests,
  people,
  showVisibility,
  canEdit,
  canManage,
  pending,
  onClose,
  onRetryPreview,
  onFullPreview,
  onEdit,
  onNewVersion,
  onToggleShare,
}: {
  doc: DocumentRow | null
  requests: InspectRequests | null
  people: Record<string, string>
  showVisibility: boolean
  canEdit: boolean
  canManage: boolean
  pending: boolean
  onClose: () => void
  onRetryPreview: () => void
  onFullPreview: (doc: DocumentRow) => void
  onEdit: (doc: DocumentRow) => void
  onNewVersion: (doc: DocumentRow) => void
  onToggleShare: (doc: DocumentRow) => void
}) {
  const version = doc?.current_version ?? null
  const editable = Boolean(doc && canEdit && !doc.archived_at)
  const shareControl = Boolean(doc && canManage && !doc.archived_at && doc.scope === 'project')

  return (
    <RecordPanel
      open={Boolean(doc && requests)}
      onClose={onClose}
      icon={FileText}
      title={doc?.name ?? 'Document'}
      description={doc ? categoryLabel(doc.category) : undefined}
      actions={
        doc && (
          <>
            {version && (
              <Button type="button" variant="outline" onClick={() => void openDownload(version.id)}>
                <Download data-icon="inline-start" /> Download
              </Button>
            )}
            {editable && (
              <Button type="button" variant="outline" onClick={() => onEdit(doc)}>
                <Pencil data-icon="inline-start" /> Edit details
              </Button>
            )}
            {version && (
              <Button type="button" onClick={() => onFullPreview(doc)}>
                <Eye data-icon="inline-start" /> Open full preview
              </Button>
            )}
          </>
        )
      }
    >
      {doc && requests && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {showVisibility && <VisibilityBadge visibility={doc.visibility} />}
            {doc.archived_at && (
              <span className="rounded-badge bg-[#F3F4F6] px-2 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-[#D6DDE5]">
                Archived
              </span>
            )}
          </div>

          <div className="flex h-64 items-center justify-center overflow-hidden rounded-lg border border-[#D6DDE5] bg-[#F3F4F6] sm:h-80">
            {requests.preview && version ? (
              <Suspense fallback={<DialogSpinner label="Loading preview" />}>
                <PreviewBody request={requests.preview} contentType={version.content_type} name={doc.name} onRetry={onRetryPreview} />
              </Suspense>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No file has been uploaded for this document.</p>
            )}
          </div>

          {version && (
            <PanelSection title="Current version">
              <div className="flex flex-col gap-0.5 rounded-lg border border-primary/25 bg-interactive-soft/50 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {`Version ${doc.current_version_number}`}
                  <span className="rounded-badge bg-interactive-soft px-2 py-0.5 text-xs font-medium text-primary">Current</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {`${version.original_filename} · ${fileTypeLabel(version.content_type)} · ${formatBytes(version.size_bytes)}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {`Uploaded by ${people[version.uploaded_by] ?? 'Team member'} · ${formatDateTime(version.uploaded_at)}`}
                </p>
              </div>
              {editable && (
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onNewVersion(doc)}>
                  <Upload data-icon="inline-start" /> Upload new version
                </Button>
              )}
            </PanelSection>
          )}

          <DetailList
            items={[
              { label: 'Category', value: categoryLabel(doc.category) },
              ...(doc.project
                ? [
                    {
                      label: 'Project',
                      value: (
                        <Link href={`/projects/${doc.project.id}/documents`} className="font-medium text-primary underline-offset-4 hover:underline">
                          {doc.project.name}
                        </Link>
                      ),
                    },
                  ]
                : []),
              { label: 'Last updated', value: formatDateTime(doc.updated_at) },
              { label: 'Description', value: doc.description || 'None' },
            ]}
          />

          {showVisibility && doc.scope === 'project' && (
            <PanelSection title="Sharing">
              <p className="text-sm text-foreground">
                {doc.visibility === 'homeowner' ? 'Visible to the homeowner in their portal.' : 'Internal only. The homeowner cannot see this document.'}
              </p>
              {shareControl ? (
                <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => onToggleShare(doc)}>
                  {doc.visibility === 'homeowner' ? <EyeOff data-icon="inline-start" /> : <Share2 data-icon="inline-start" />}
                  {doc.visibility === 'homeowner' ? 'Make internal' : 'Share with homeowner'}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {doc.archived_at ? 'Restore this document to change sharing.' : 'Only administrators and project managers can change sharing.'}
                </p>
              )}
            </PanelSection>
          )}

          <PanelSection title="Version history">
            <Suspense fallback={<DialogSpinner label="Loading history" />}>
              <HistoryBody request={requests.history} currentVersion={doc.current_version_number} />
            </Suspense>
          </PanelSection>
        </>
      )}
    </RecordPanel>
  )
}

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
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[#D6DDE5] bg-[#F3F4F6]">
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
    <ol className="flex flex-col divide-y divide-[#D6DDE5] rounded-lg border border-[#D6DDE5]">
      {res.data.map((v: DocumentVersionEntry) => (
        <li key={v.id} className="flex items-start justify-between gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {`Version ${v.versionNumber}`}
              {v.versionNumber === currentVersion && (
                <span className="rounded-badge bg-interactive-soft px-2 py-0.5 text-xs font-medium text-primary">Current</span>
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
