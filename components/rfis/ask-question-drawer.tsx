'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR, { useSWRConfig } from 'swr'
import { AlertCircle, CircleCheck, ExternalLink, FolderOpen, Loader2, MessageCircleQuestion, Paperclip, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { FormOverlay, OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'
import { FieldShell, NativeSelect, TextAreaField, TextField } from '@/components/shared/form-field'
import { RfiFileList } from '@/components/rfis/rfi-files'
import {
  registerRfiAttachmentAction,
  removeRfiAttachmentAction,
  saveRfiDraftAction,
  sendRfiAction,
} from '@/app/actions/rfis'
import {
  RFIS_BUCKET,
  RFI_FILE_ACCEPT,
  RFI_FILE_HELP,
  RFI_MAX_FILES,
  ineligibleExplanation,
  rfiFileProblem,
  rfiFileType,
  rfiObjectPath,
  rfiRef,
  rfisPath,
  type RfiDetail,
  type RfiDraftInput,
  type RfiFormOptions,
  type RfiProjectOption,
  type RfiResponderOption,
} from '@/lib/rfis'

export type AskQuestionRequest = {
  /** Inside a project the question inherits it. Without one, the person has to choose; nothing is preselected. */
  projectId?: string
  projectName?: string
  /** Reopens a saved draft for editing. */
  draftId?: string
  /** Prefills the document reference, for "Ask about this document". */
  document?: { versionId: string; label: string }
}

type AttachedFile = { id: string; storage_path: string; file_name: string; size_bytes: number }
type FormValues = { subject: string; question: string; due_date: string; location: string; document_version_id: string }
type Initial = {
  rfiId: string
  rowVersion: number | null
  saved: boolean
  project: { id: string; name: string } | null
  responderKey: string
  values: FormValues
  attachments: AttachedFile[]
}
type FieldKey = 'project' | 'subject' | 'question' | 'responder'

export const rfiDetailKey = (rfiId: string) => `/api/rfis/${rfiId}`
const optionsKey = (projectId: string) => `/api/rfis/options?project=${projectId}`
const PROJECTS_KEY = '/api/rfis/options'
/** Cached question details, but not the option lists. */
export const isRfiDetailKey = (key: unknown) => typeof key === 'string' && key.startsWith('/api/rfis/') && !key.startsWith(PROJECTS_KEY)

export async function fetchRfiJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
  // An expired session is redirected to the sign-in page rather than answered with JSON.
  if (res.redirected) throw new Error('Your session has ended. Sign in again to continue.')
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'This could not be loaded. Try again.')
  return body as T
}

/**
 * The one drawer for asking a question and for editing a draft, opened from Quick Create, the Questions page,
 * and a document's actions. It opens over the current page and leaves the URL alone.
 */
export function AskQuestionDrawer({ request, onClose }: { request: AskQuestionRequest | null; onClose: () => void }) {
  // The last request stays rendered through the closing transition.
  const [shown, setShown] = useState(request)
  if (request && request !== shown) setShown(request)
  const current = request ?? shown
  return (
    <FormOverlay
      open={Boolean(request)}
      onClose={onClose}
      variant="drawer"
      size="lg"
      icon={MessageCircleQuestion}
      title={current?.draftId ? 'Edit draft question' : 'Ask a question (RFI)'}
      description="One question for one assigned responder. An answer never authorizes work, changes the schedule, or updates the budget."
    >
      {request && <DrawerContent request={request} />}
    </FormOverlay>
  )
}

function DrawerContent({ request }: { request: AskQuestionRequest }) {
  const [newId] = useState(() => crypto.randomUUID())
  const draft = useSWR<RfiDetail>(request.draftId ? rfiDetailKey(request.draftId) : null, fetchRfiJson, { revalidateOnFocus: false })

  if (request.draftId) {
    if (draft.error) return <Placeholder error={draft.error instanceof Error ? draft.error.message : 'The draft could not be loaded.'} onRetry={() => void draft.mutate()} />
    if (!draft.data) return <Placeholder />
    const { rfi, attachments, projectName } = draft.data
    if (rfi.status !== 'draft') return <Placeholder error="This question has already been sent, so it can no longer be edited as a draft. Close this and open it from the list." />
    return (
      <QuestionForm
        request={request}
        initial={{
          rfiId: rfi.id,
          rowVersion: rfi.row_version,
          saved: true,
          project: { id: rfi.project_id, name: projectName ?? request.projectName ?? 'This project' },
          responderKey: rfi.responder_user_id ? `user:${rfi.responder_user_id}` : '',
          values: {
            subject: rfi.subject,
            question: rfi.question,
            due_date: rfi.due_date ?? '',
            location: rfi.location ?? '',
            document_version_id: rfi.document_version_id ?? '',
          },
          attachments: attachments.filter((a) => a.kind === 'question'),
        }}
        savedDocumentLabel={rfi.document_label}
      />
    )
  }

  return (
    <QuestionForm
      request={request}
      initial={{
        rfiId: newId,
        rowVersion: null,
        saved: false,
        project: request.projectId ? { id: request.projectId, name: request.projectName ?? 'This project' } : null,
        responderKey: '',
        values: { subject: '', question: '', due_date: '', location: '', document_version_id: request.document?.versionId ?? '' },
        attachments: [],
      }}
      savedDocumentLabel={request.document?.label ?? null}
    />
  )
}

function Placeholder({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  const overlay = useFormOverlay()
  return (
    <>
      <OverlayBody>
        {error ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
            {onRetry && (
              <Button type="button" variant="outline" size="sm" className="bg-background" onClick={onRetry}>
                Try again
              </Button>
            )}
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center" role="status">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Loading the draft</span>
          </div>
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="outline" size="lg" onClick={() => overlay?.requestClose()}>
          Close
        </Button>
      </OverlayFooter>
    </>
  )
}

function responderOptionLabel(o: RfiResponderOption) {
  return o.company_name && o.company_name !== o.full_name ? `${o.full_name} · ${o.company_name}` : o.full_name
}

function QuestionForm({
  request,
  initial,
  savedDocumentLabel,
}: {
  request: AskQuestionRequest
  initial: Initial
  savedDocumentLabel: string | null
}) {
  const overlay = useFormOverlay()
  const router = useRouter()
  const { mutate } = useSWRConfig()

  const [project, setProject] = useState(initial.project)
  const [values, setValues] = useState(initial.values)
  const [responderKey, setResponderKey] = useState(initial.responderKey)
  const [rowVersion, setRowVersion] = useState(initial.rowVersion)
  const [saved, setSaved] = useState(initial.saved)
  const [attachments, setAttachments] = useState(initial.attachments)
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [busy, setBusy] = useState<'save' | 'send' | 'files' | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initial.values.location || initial.values.document_version_id))
  // One guard for every action, so a double click or a second button cannot start a parallel save.
  const lock = useRef(false)
  const sendRequest = useRef(crypto.randomUUID())
  const fileInput = useRef<HTMLInputElement>(null)
  const rfiId = initial.rfiId

  const projects = useSWR<{ projects: RfiProjectOption[] }>(!initial.project ? PROJECTS_KEY : null, fetchRfiJson, {
    revalidateOnFocus: false,
  })
  const options = useSWR<RfiFormOptions>(project ? optionsKey(project.id) : null, fetchRfiJson, { revalidateOnFocus: false })
  const responders = options.data?.responders ?? []
  const selected = responders.find((o) => o.option_key === responderKey) ?? null
  // A saved responder who has since lost access no longer appears among the choices.
  const savedResponderGone = Boolean(options.data && responderKey && !selected)
  const responderUserId = selected
    ? selected.eligible && selected.user_id
      ? selected.user_id
      : ''
    : !options.data && responderKey.startsWith('user:')
      ? responderKey.slice(5)
      : ''

  const documents = options.data?.documents ?? []
  const documentChoices =
    values.document_version_id && savedDocumentLabel && !documents.some((d) => d.versionId === values.document_version_id)
      ? [{ versionId: values.document_version_id, label: savedDocumentLabel }, ...documents]
      : documents

  function change(patch: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...patch }))
    overlay?.markDirty()
  }

  function clearFieldError(key: FieldKey) {
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }

  function refreshLists() {
    router.refresh()
    void mutate(isRfiDetailKey)
  }

  async function run(kind: 'save' | 'send' | 'files', work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true
    setBusy(kind)
    setError(null)
    try {
      await work()
    } catch {
      setError('The connection was interrupted. Everything you typed is still here. Try again.')
    } finally {
      lock.current = false
      setBusy(null)
    }
  }

  function payload(): RfiDraftInput {
    return { ...values, responder_user_id: responderUserId }
  }

  /** Creates or updates the draft. The id is fixed for this drawer, so a retried create lands on the same record. */
  async function persist(): Promise<{ rowVersion: number } | null> {
    const problems: Partial<Record<FieldKey, string>> = {}
    if (!project) problems.project = 'Choose the project this question is for.'
    if (!values.subject.trim()) problems.subject = 'Add a subject. It is the only thing a draft needs.'
    setFieldErrors(problems)
    if (!project || Object.keys(problems).length) return null
    const r = await saveRfiDraftAction(project.id, rfiId, rowVersion, payload())
    if (!r.ok) {
      setError(r.error)
      return null
    }
    setRowVersion(r.rowVersion)
    setSaved(true)
    overlay?.setDirty(false)
    return { rowVersion: r.rowVersion }
  }

  function saveDraft() {
    void run('save', async () => {
      const r = await persist()
      if (!r || !project) return
      const href = rfisPath(project.id, rfiId)
      toast.success('Draft saved', {
        description: 'Only you and project managers can see it until it is sent.',
        action: { label: 'View draft', onClick: () => router.push(href) },
      })
      refreshLists()
      overlay?.forceClose()
    })
  }

  function send() {
    void run('send', async () => {
      const problems: Partial<Record<FieldKey, string>> = {}
      if (!project) problems.project = 'Choose the project this question is for.'
      if (!values.subject.trim()) problems.subject = 'Add a subject.'
      if (!values.question.trim()) problems.question = 'Write the question before sending.'
      if (!responderKey || savedResponderGone) problems.responder = 'Choose who should answer.'
      else if (selected && !selected.eligible) problems.responder = 'This person cannot open the question yet. Choose someone with access to send it now.'
      if (!project || Object.keys(problems).length) {
        setFieldErrors(problems)
        setError('Complete the highlighted fields to send. You can still save this as a draft.')
        return
      }
      const draft = await persist()
      if (!draft) return
      const r = await sendRfiAction(project.id, rfiId, draft.rowVersion, sendRequest.current)
      if (!r.ok) {
        // The draft exists and stays a draft; nothing reaches the responder until the send itself succeeds.
        setError(`Your draft is saved, but the question was not sent. ${r.error}`)
        refreshLists()
        return
      }
      const href = rfisPath(project.id, rfiId)
      toast.success(`${rfiRef(r.rfiNumber)} sent to ${selected?.full_name ?? 'the responder'}`, {
        action: { label: 'View question', onClick: () => router.push(href) },
      })
      refreshLists()
      overlay?.forceClose()
    })
  }

  function attach(files: File[]) {
    void run('files', async () => {
      if (!project || !options.data) {
        setFileErrors([project ? 'The project is still loading. Try attaching the files again in a moment.' : 'Choose a project before attaching files.'])
        return
      }
      // Files are stored under the question, so the draft has to exist first.
      if (!saved && !(await persist())) {
        if (!values.subject.trim()) {
          setFileErrors(['Add a subject first. The draft is saved before files are attached, so nothing you attach is lost.'])
        }
        return
      }
      const supabase = createClient()
      const problems: string[] = []
      let count = attachments.length
      for (const file of files) {
        if (count >= RFI_MAX_FILES) {
          problems.push(`${file.name} was not attached. A question can have up to ${RFI_MAX_FILES} files.`)
          continue
        }
        const problem = rfiFileProblem(file)
        const type = rfiFileType(file)
        if (problem || !type) {
          problems.push(problem ?? `${file.name} is not a supported file type.`)
          continue
        }
        const path = rfiObjectPath(
          { organization_id: options.data.project.organization_id, project_id: project.id, id: rfiId },
          'question',
          file.name,
          crypto.randomUUID(),
        )
        const { error: uploadError } = await supabase.storage.from(RFIS_BUCKET).upload(path, file, { contentType: type })
        if (uploadError) {
          problems.push(`${file.name} could not be uploaded. Check your connection and attach it again.`)
          continue
        }
        const r = await registerRfiAttachmentAction(project.id, rfiId, { path, name: file.name.slice(0, 200), type, size: file.size })
        if (!r.ok) {
          await supabase.storage.from(RFIS_BUCKET).remove([path])
          problems.push(`${file.name} was not attached. ${r.error}`)
          continue
        }
        count += 1
        setAttachments((prev) => [...prev, { id: r.id, storage_path: path, file_name: file.name.slice(0, 200), size_bytes: file.size }])
      }
      setFileErrors(problems)
      refreshLists()
    })
  }

  function removeFile(file: { id: string; file_name: string }) {
    void run('files', async () => {
      if (!project) return
      const r = await removeRfiAttachmentAction(project.id, rfiId, file.id)
      if (!r.ok) {
        setFileErrors([`${file.file_name} was not removed. ${r.error}`])
        return
      }
      setAttachments((prev) => prev.filter((a) => a.id !== file.id))
      refreshLists()
    })
  }

  const explanation = selected && !selected.eligible && project ? ineligibleExplanation(selected, project.id) : null
  const eligibleTeam = responders.filter((o) => o.eligible && o.kind === 'team')
  const eligibleExternal = responders.filter((o) => o.eligible && o.kind !== 'team')
  const ineligible = responders.filter((o) => !o.eligible)
  const projectLocked = Boolean(initial.project) || saved

  return (
    <form className="flex min-h-0 flex-1 flex-col" noValidate onSubmit={(e) => e.preventDefault()}>
      <OverlayBody className="flex flex-col gap-5">
        {projectLocked && project ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="flex min-w-0 flex-col">
              <span className="text-xs text-muted-foreground">Project</span>
              <span className="truncate text-sm font-semibold text-foreground">{project.name}</span>
            </p>
          </div>
        ) : (
          <FieldShell
            name="rfi-project"
            label="Project"
            required
            error={fieldErrors.project ?? (projects.error instanceof Error ? projects.error.message : undefined)}
            hint="Choose the project this question belongs to. Its people and documents load once it is chosen."
          >
            <NativeSelect
              id="rfi-project"
              name="rfi-project"
              required
              value={project?.id ?? ''}
              disabled={!projects.data || busy !== null}
              aria-invalid={fieldErrors.project ? true : undefined}
              onChange={(e) => {
                const next = projects.data?.projects.find((p) => p.id === e.target.value) ?? null
                setProject(next ? { id: next.id, name: next.name } : null)
                // People and documents belong to one project, so they never carry over to another.
                setResponderKey('')
                change({ document_version_id: '' })
                clearFieldError('project')
              }}
            >
              <option value="">{projects.data ? 'Choose a project' : projects.error ? 'Projects could not be loaded' : 'Loading projects…'}</option>
              {(projects.data?.projects ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.project_number ? `${p.name} (${p.project_number})` : p.name}
                </option>
              ))}
            </NativeSelect>
          </FieldShell>
        )}

        <TextField
          name="rfi-subject"
          label="Subject"
          required
          maxLength={200}
          autoFocus={Boolean(initial.project)}
          value={values.subject}
          error={fieldErrors.subject}
          placeholder="Main panel location in the garage"
          onChange={(e) => {
            change({ subject: e.target.value })
            clearFieldError('subject')
          }}
        />

        <TextAreaField
          name="rfi-question"
          label="Question"
          maxLength={10000}
          value={values.question}
          error={fieldErrors.question}
          hint="Needed to send. A draft can be saved without it."
          placeholder="Describe exactly what you need to know."
          onChange={(e) => {
            change({ question: e.target.value })
            clearFieldError('question')
          }}
        />

        <div className="flex flex-col gap-2">
          <FieldShell
            name="rfi-responder"
            label="Assigned responder"
            error={fieldErrors.responder ?? (options.error instanceof Error ? options.error.message : undefined)}
            hint="One person who can already sign in to this project. Needed to send."
          >
            <NativeSelect
              id="rfi-responder"
              name="rfi-responder"
              value={savedResponderGone ? '' : responderKey}
              disabled={!options.data || busy !== null}
              aria-invalid={fieldErrors.responder ? true : undefined}
              aria-describedby={fieldErrors.responder ? 'rfi-responder-error' : 'rfi-responder-hint'}
              onChange={(e) => {
                setResponderKey(e.target.value)
                overlay?.markDirty()
                clearFieldError('responder')
              }}
            >
              <option value="">
                {!project ? 'Choose a project first' : options.data ? 'Choose who should answer' : options.error ? 'People could not be loaded' : 'Loading people…'}
              </option>
              {eligibleTeam.length > 0 && (
                <optgroup label="Builder team">
                  {eligibleTeam.map((o) => (
                    <option key={o.option_key} value={o.option_key}>
                      {responderOptionLabel(o)}
                    </option>
                  ))}
                </optgroup>
              )}
              {eligibleExternal.length > 0 && (
                <optgroup label="Subcontractors">
                  {eligibleExternal.map((o) => (
                    <option key={o.option_key} value={o.option_key}>
                      {responderOptionLabel(o)}
                    </option>
                  ))}
                </optgroup>
              )}
              {ineligible.length > 0 && (
                <optgroup label="No access to this project yet">
                  {ineligible.map((o) => (
                    <option key={o.option_key} value={o.option_key}>
                      {responderOptionLabel(o)}
                    </option>
                  ))}
                </optgroup>
              )}
            </NativeSelect>
          </FieldShell>
          {options.error && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void options.mutate()}>
              Load people again
            </Button>
          )}
          {savedResponderGone && (
            <p role="status" className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              The responder saved on this draft can no longer sign in to this project. Choose someone else.
            </p>
          )}
          {explanation && (
            <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
              <p className="font-medium">{explanation.message}</p>
              <p>
                Choose someone else to send now, or save this as a draft and set up their access first. Nothing is sent to them and no
                access is created from here.
              </p>
              {options.data?.manager ? (
                <a
                  href={explanation.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-fit items-center gap-1 font-medium underline underline-offset-4"
                >
                  {explanation.linkLabel}
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                <p>Ask an administrator or project manager to set up their access.</p>
              )}
            </div>
          )}
        </div>

        <TextField
          name="rfi-due"
          label="Due date"
          type="date"
          value={values.due_date}
          hint="Optional. When you need the answer by."
          onChange={(e) => change({ due_date: e.target.value })}
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Attachments</span>
              <span className="text-xs text-muted-foreground">{`Optional. ${RFI_FILE_HELP}`}</span>
            </p>
            <input
              ref={fileInput}
              id="rfi-files"
              type="file"
              multiple
              accept={RFI_FILE_ACCEPT}
              className="sr-only"
              aria-label="Attach files to the question"
              tabIndex={-1}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                e.target.value = ''
                if (picked.length) attach(picked)
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => fileInput.current?.click()}>
              {busy === 'files' ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Paperclip data-icon="inline-start" />}
              {busy === 'files' ? 'Working…' : 'Attach files'}
            </Button>
          </div>
          <RfiFileList files={attachments} onRemove={removeFile} removing={busy !== null} />
          {fileErrors.length > 0 && (
            <div role="alert" className="flex flex-col gap-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {fileErrors.map((message) => (
                <p key={message}>{message}</p>
              ))}
              <p className="text-xs text-destructive/80">Your question and any files already attached are unchanged.</p>
            </div>
          )}
        </div>

        <details
          open={detailsOpen}
          onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
          className="rounded-lg border border-border [&[open]>summary]:border-b [&[open]>summary]:border-border"
        >
          <summary className="cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
            Additional details
            <span className="ml-2 text-xs font-normal text-muted-foreground">Optional location and document reference</span>
          </summary>
          <div className="flex flex-col gap-4 p-3">
            <TextField
              name="rfi-location"
              label="Location"
              maxLength={300}
              value={values.location}
              placeholder="Garage, north wall"
              onChange={(e) => change({ location: e.target.value })}
            />
            <FieldShell
              name="rfi-document"
              label="Document reference"
              hint="Points to one exact version. People who cannot open that document still cannot open it from the question."
            >
              <NativeSelect
                id="rfi-document"
                name="rfi-document"
                value={values.document_version_id}
                disabled={!project || busy !== null || (documentChoices.length === 0 && Boolean(options.data))}
                aria-describedby="rfi-document-hint"
                onChange={(e) => change({ document_version_id: e.target.value })}
              >
                <option value="">
                  {!project ? 'Choose a project first' : !options.data ? 'Loading documents…' : documentChoices.length ? 'No document' : 'No documents on this project'}
                </option>
                {documentChoices.map((d) => (
                  <option key={d.versionId} value={d.versionId}>
                    {d.label}
                  </option>
                ))}
              </NativeSelect>
            </FieldShell>
          </div>
        </details>
      </OverlayBody>

      <OverlayFooter
        message={
          error ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : saved && !overlay?.dirty ? (
            <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CircleCheck className="size-3.5 text-primary" aria-hidden="true" />
              Saved as a draft. It is not sent until you choose Send question.
            </p>
          ) : null
        }
      >
        <Button type="button" variant="ghost" size="lg" onClick={() => overlay?.requestClose()} disabled={busy !== null}>
          Cancel
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={saveDraft} disabled={busy !== null}>
          {busy === 'save' && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {busy === 'save' ? 'Saving…' : 'Save draft'}
        </Button>
        <Button type="button" size="lg" onClick={send} disabled={busy !== null}>
          {busy === 'send' ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Send data-icon="inline-start" />}
          {busy === 'send' ? 'Sending…' : 'Send question'}
        </Button>
      </OverlayFooter>
    </form>
  )
}
