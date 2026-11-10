'use client'

import { useRef, useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, CircleCheck, Loader2, MapPin, MessageSquareReply, Paperclip, Pencil, RefreshCw, Undo2, UserRoundCog } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useFormOverlay } from '@/components/shared/form-overlay'
import { FieldShell, NativeSelect, TextAreaField, TextField } from '@/components/shared/form-field'
import { PanelSection } from '@/components/shared/record-panel'
import { RfiStatusBadge } from '@/components/rfis/rfi-status-badge'
import { RfiDocumentLink, RfiFileList } from '@/components/rfis/rfi-files'
import { fetchRfiJson } from '@/components/rfis/ask-question-drawer'
import {
  amendRfiAction,
  answerRfiAction,
  commentRfiAction,
  reassignRfiAction,
  setRfiHomeownerSharedAction,
  transitionRfiAction,
} from '@/app/actions/rfis'
import {
  RFIS_BUCKET,
  RFI_FILE_ACCEPT,
  RFI_FILE_HELP,
  RFI_MAX_FILES,
  RFI_STATUS_HINTS,
  isRfiOverdue,
  responderLabel,
  rfiEventSummary,
  rfiFileProblem,
  rfiFileType,
  rfiObjectPath,
  type RfiAttachment,
  type RfiDetail,
  type RfiEvent,
  type RfiFileInput,
  type RfiFormOptions,
  type RfiRecord,
  type RfiResponse,
} from '@/lib/rfis'

type Outcome = { ok: true } | { ok: false; error: string; conflict?: boolean }
type Failure = { message: string; conflict: boolean }

/**
 * Runs one workflow action at a time. A failed action keeps everything the person typed; when the record
 * changed underneath them, the message offers to load the latest version instead of overwriting it.
 */
function useAction(onChanged: () => void) {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const lock = useRef(false)

  async function run(work: () => Promise<Outcome>): Promise<boolean> {
    if (lock.current) return false
    lock.current = true
    setPending(true)
    setFailure(null)
    try {
      const result = await work()
      if (result.ok) {
        onChanged()
        return true
      }
      setFailure({ message: result.error, conflict: Boolean(result.conflict) })
      return false
    } catch {
      setFailure({ message: 'The connection was interrupted. What you typed is still here. Try again.', conflict: false })
      return false
    } finally {
      lock.current = false
      setPending(false)
    }
  }

  return { pending, failure, run, clear: () => setFailure(null) }
}

function ActionError({ failure, onReload }: { failure: Failure | null; onReload: () => void }) {
  if (!failure) return null
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <p className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {failure.message}
      </p>
      {failure.conflict && (
        <Button type="button" variant="outline" size="sm" className="bg-background" onClick={onReload}>
          <RefreshCw data-icon="inline-start" />
          Load the latest version
        </Button>
      )}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}

const BODY_CLASS = 'whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground'

/**
 * Everything about one question: the question as asked, its files and references, the official answer kept
 * apart from comments, and the history. Actions appear only for the people who may take them; the server
 * checks each one again.
 */
export function RfiDetailView({
  detail,
  onChanged,
  onEditDraft,
}: {
  detail: RfiDetail
  /** Reloads the question after a change, or when a newer version has to be loaded. */
  onChanged: () => void
  /** Staff only: reopens a draft in the question drawer. */
  onEditDraft?: () => void
}) {
  const { rfi, responses, events, attachments, permissions, today } = detail
  const overdue = isRfiOverdue(rfi.status, rfi.due_date, today)
  const questionFiles = attachments.filter((a) => a.kind === 'question')
  const sent = events.find((e) => e.event_type === 'sent')
  const amended = events.some((e) => e.event_type === 'amended')
  const canAnswer = permissions.participant && permissions.isResponder && rfi.status === 'open'

  return (
    <>
      <section aria-label="Status" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <RfiStatusBadge status={rfi.status} overdue={overdue} />
          <span className="text-xs text-muted-foreground">{RFI_STATUS_HINTS[rfi.status]}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Assigned responder">{responderLabel(rfi)}</Fact>
          <Fact label="Due date">
            <span className={overdue ? 'text-destructive' : undefined}>{rfi.due_date ? formatDate(rfi.due_date) : 'No due date'}</span>
          </Fact>
          <Fact label="Asked by">{rfi.created_by_name}</Fact>
          <Fact label={rfi.sent_at ? 'Sent' : 'Created'}>{formatDateTime(rfi.sent_at ?? rfi.created_at)}</Fact>
        </dl>
        {rfi.homeowner_shared && permissions.participant && (
          <p className="text-xs text-muted-foreground">Shared with the homeowner, read-only.</p>
        )}
      </section>

      <PanelSection title="Question">
        {rfi.question.trim() ? <p className={BODY_CLASS}>{rfi.question}</p> : <p className="text-sm text-muted-foreground">No question written yet.</p>}
        {rfi.location && (
          <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="sr-only">Location: </span>
              {rfi.location}
            </span>
          </p>
        )}
        {rfi.document_label && (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Document reference</span>
            <RfiDocumentLink rfiId={rfi.id} label={rfi.document_label} />
          </div>
        )}
        {questionFiles.length > 0 && (
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">Attachments</span>
            <RfiFileList files={questionFiles} />
          </div>
        )}
        {amended && sent && <SentSnapshot event={sent} />}
      </PanelSection>

      <PanelSection title="Official answer">
        <Answers rfi={rfi} responses={responses} attachments={attachments} />
        {canAnswer && <AnswerForm rfi={rfi} onChanged={onChanged} />}
      </PanelSection>

      {permissions.canEdit && <RequesterActions detail={detail} onChanged={onChanged} onEditDraft={onEditDraft} />}

      {permissions.participant && rfi.status !== 'draft' && <Comments detail={detail} onChanged={onChanged} />}

      {permissions.participant && events.length > 0 && (
        <PanelSection title="History">
          <ol className="flex flex-col gap-3">
            {events.map((event) => (
              <HistoryEntry key={event.id} event={event} />
            ))}
          </ol>
        </PanelSection>
      )}
    </>
  )
}

/** The question exactly as it was first sent, shown once it has been amended so the original is never lost. */
function SentSnapshot({ event }: { event: RfiEvent }) {
  const subject = typeof event.details.subject === 'string' ? event.details.subject : ''
  const question = typeof event.details.question === 'string' ? event.details.question : ''
  if (!question) return null
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Question as originally sent
        <span className="ml-2 text-xs font-normal text-muted-foreground">{formatDateTime(event.created_at)}</span>
      </summary>
      <div className="flex flex-col gap-1 border-t border-border p-3">
        {subject && <p className="text-sm font-medium text-foreground">{subject}</p>}
        <p className={BODY_CLASS}>{question}</p>
      </div>
    </details>
  )
}

function Answers({ rfi, responses, attachments }: { rfi: RfiRecord; responses: RfiResponse[]; attachments: RfiAttachment[] }) {
  if (responses.length === 0) {
    const message =
      rfi.status === 'draft'
        ? 'This question has not been sent yet.'
        : rfi.status === 'closed'
          ? 'Closed without an official answer.'
          : `Waiting for ${rfi.responder_name ?? 'the assigned responder'} to answer.`
    return <p className="text-sm text-muted-foreground">{message}</p>
  }
  const newestFirst = [...responses].reverse()
  // After a clarification request the question is open again and no answer exists for the new round yet.
  const awaitingNewAnswer = rfi.status === 'open'
  return (
    <div className="flex flex-col gap-3">
      {awaitingNewAnswer && (
        <p className="rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Clarification was requested. Waiting for {rfi.responder_name ?? 'the assigned responder'} to answer again. Earlier answers are kept below.
        </p>
      )}
      {newestFirst.map((response, index) => {
        const current = index === 0 && !awaitingNewAnswer
        const files = attachments.filter((a) => a.response_id === response.id)
        return (
          <article
            key={response.id}
            aria-label={current ? 'Official answer' : 'Earlier answer'}
            className={cn('flex flex-col gap-2 rounded-lg border p-3', current ? 'border-primary/30 bg-sage/40' : 'border-border bg-muted/40')}
          >
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span className={cn('inline-flex items-center gap-1 font-semibold', current ? 'text-primary' : 'text-muted-foreground')}>
                {current && <CircleCheck className="size-3.5" aria-hidden="true" />}
                {current ? 'Official answer' : 'Earlier answer'}
              </span>
              <span>
                {response.responded_by_company ? `${response.responded_by_name} · ${response.responded_by_company}` : response.responded_by_name}
              </span>
              <span>{formatDateTime(response.created_at)}</span>
            </p>
            <p className={BODY_CLASS}>{response.body}</p>
            <RfiFileList files={files} />
          </article>
        )
      })}
    </div>
  )
}

function AnswerForm({ rfi, onChanged }: { rfi: RfiRecord; onChanged: () => void }) {
  const overlay = useFormOverlay()
  const action = useAction(onChanged)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<RfiFileInput[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [missing, setMissing] = useState(false)
  // Stays the same across retries of one answer, so a repeated submission is recognised and not stored twice.
  const requestId = useRef(crypto.randomUUID())
  const input = useRef<HTMLInputElement>(null)
  const busy = action.pending || uploading

  async function attach(picked: File[]) {
    setUploading(true)
    const supabase = createClient()
    const problems: string[] = []
    let count = files.length
    try {
      for (const file of picked) {
        if (count >= RFI_MAX_FILES) {
          problems.push(`${file.name} was not attached. An answer can have up to ${RFI_MAX_FILES} files.`)
          continue
        }
        const problem = rfiFileProblem(file)
        const type = rfiFileType(file)
        if (problem || !type) {
          problems.push(problem ?? `${file.name} is not a supported file type.`)
          continue
        }
        const path = rfiObjectPath(rfi, 'answer', file.name, crypto.randomUUID())
        const { error } = await supabase.storage.from(RFIS_BUCKET).upload(path, file, { contentType: type })
        if (error) {
          problems.push(`${file.name} could not be uploaded. Check your connection and attach it again.`)
          continue
        }
        count += 1
        setFiles((prev) => [...prev, { path, name: file.name.slice(0, 200), type, size: file.size }])
        overlay?.markDirty()
      }
    } finally {
      setFileErrors(problems)
      setUploading(false)
    }
  }

  async function removeFile(path: string) {
    setUploading(true)
    try {
      await createClient().storage.from(RFIS_BUCKET).remove([path])
      setFiles((prev) => prev.filter((f) => f.path !== path))
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    if (!body.trim()) {
      setMissing(true)
      return
    }
    const ok = await action.run(() => answerRfiAction(rfi.project_id, rfi.id, rfi.row_version, body, files, requestId.current))
    if (!ok) return
    toast.success('Official answer submitted', { description: 'The person who asked has been notified to review it.' })
    requestId.current = crypto.randomUUID()
    setBody('')
    setFiles([])
    overlay?.setDirty(false)
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-primary/30 p-3"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <TextAreaField
        name={`rfi-answer-${rfi.id}`}
        label="Your official answer"
        required
        maxLength={10000}
        value={body}
        error={missing ? 'Write your answer before submitting.' : undefined}
        hint="This is the answer of record. Use comments below for discussion."
        onChange={(e) => {
          setBody(e.target.value)
          setMissing(false)
          overlay?.markDirty()
        }}
      />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{`Optional attachments. ${RFI_FILE_HELP}`}</span>
          <input
            ref={input}
            type="file"
            multiple
            accept={RFI_FILE_ACCEPT}
            className="sr-only"
            aria-label="Attach files to your answer"
            tabIndex={-1}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (picked.length) void attach(picked)
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            {uploading ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Paperclip data-icon="inline-start" />}
            {uploading ? 'Working…' : 'Attach files'}
          </Button>
        </div>
        <RfiFileList
          files={files.map((f) => ({ id: f.path, storage_path: f.path, file_name: f.name, size_bytes: f.size }))}
          onRemove={(f) => void removeFile(f.storage_path)}
          removing={busy}
        />
        {fileErrors.length > 0 && (
          <div role="alert" className="flex flex-col gap-1 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {fileErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
            <p className="text-xs text-destructive/80">Your answer text and the files already attached are unchanged.</p>
          </div>
        )}
      </div>
      <ActionError failure={action.failure} onReload={onChanged} />
      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={busy}>
        {action.pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <MessageSquareReply data-icon="inline-start" />}
        {action.pending ? 'Submitting…' : 'Submit answer'}
      </Button>
    </form>
  )
}

type Panel = 'close' | 'reopen' | 'amend' | 'reassign'

function RequesterActions({ detail, onChanged, onEditDraft }: { detail: RfiDetail; onChanged: () => void; onEditDraft?: () => void }) {
  const { rfi, permissions } = detail
  const [panel, setPanel] = useState<Panel | null>(null)
  const share = useAction(onChanged)
  const done = (message: string) => {
    toast.success(message)
    setPanel(null)
  }

  if (rfi.status === 'draft') {
    return (
      <PanelSection title="Next step">
        <p className="text-sm text-muted-foreground">This draft has not been sent. Finish it and send it when it is ready.</p>
        {onEditDraft && (
          <Button type="button" size="lg" className="w-full sm:w-fit" onClick={onEditDraft}>
            <Pencil data-icon="inline-start" />
            Edit draft
          </Button>
        )}
      </PanelSection>
    )
  }

  const canClose = rfi.status === 'open' || rfi.status === 'answered'
  const canReopen = rfi.status === 'answered' || rfi.status === 'closed'

  return (
    <PanelSection title={rfi.status === 'answered' ? 'Review' : 'Manage'}>
      {rfi.status === 'answered' && <p className="text-sm text-muted-foreground">Read the official answer, then close the question or ask for clarification.</p>}
      <div className="flex flex-wrap gap-2">
        {canClose && (
          <Button type="button" size="lg" variant={rfi.status === 'answered' ? 'default' : 'outline'} aria-pressed={panel === 'close'} onClick={() => setPanel(panel === 'close' ? null : 'close')}>
            <CircleCheck data-icon="inline-start" />
            Close question
          </Button>
        )}
        {canReopen && (
          <Button type="button" size="lg" variant="outline" aria-pressed={panel === 'reopen'} onClick={() => setPanel(panel === 'reopen' ? null : 'reopen')}>
            <Undo2 data-icon="inline-start" />
            Request clarification
          </Button>
        )}
        {rfi.status === 'open' && (
          <Button type="button" size="lg" variant="outline" aria-pressed={panel === 'amend'} onClick={() => setPanel(panel === 'amend' ? null : 'amend')}>
            <Pencil data-icon="inline-start" />
            Edit question
          </Button>
        )}
        <Button type="button" size="lg" variant="outline" aria-pressed={panel === 'reassign'} onClick={() => setPanel(panel === 'reassign' ? null : 'reassign')}>
          <UserRoundCog data-icon="inline-start" />
          Reassign
        </Button>
      </div>

      {panel === 'close' && (
        <ReasonForm
          key="close"
          id={`rfi-close-${rfi.id}`}
          label={rfi.status === 'open' ? 'Reason for closing without an answer' : 'Closing note'}
          hint={rfi.status === 'open' ? 'Required, for example withdrawn or resolved on site. The responder is told it was closed.' : 'Optional. Recorded in the history.'}
          required={rfi.status === 'open'}
          submitLabel="Close question"
          onCancel={() => setPanel(null)}
          onReload={onChanged}
          onChanged={onChanged}
          onDone={() => done('Question closed')}
          submit={(reason, requestId) => transitionRfiAction(rfi.project_id, rfi.id, rfi.row_version, 'close', reason, requestId)}
        />
      )}
      {panel === 'reopen' && (
        <ReasonForm
          key="reopen"
          id={`rfi-reopen-${rfi.id}`}
          label="What needs clarification?"
          hint="Required. The question reopens for the responder and every earlier answer is kept."
          required
          submitLabel="Request clarification"
          onCancel={() => setPanel(null)}
          onReload={onChanged}
          onChanged={onChanged}
          onDone={() => done('Clarification requested')}
          submit={(reason, requestId) => transitionRfiAction(rfi.project_id, rfi.id, rfi.row_version, 'reopen', reason, requestId)}
        />
      )}
      {panel === 'amend' && <AmendForm rfi={rfi} onCancel={() => setPanel(null)} onChanged={onChanged} onDone={() => done('Question updated')} />}
      {panel === 'reassign' && <ReassignForm rfi={rfi} onCancel={() => setPanel(null)} onChanged={onChanged} onDone={() => done('Question reassigned')} />}

      {permissions.canManage && (
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              checked={rfi.homeowner_shared}
              disabled={share.pending}
              onChange={(e) => {
                const next = e.target.checked
                void share
                  .run(() => setRfiHomeownerSharedAction(rfi.project_id, rfi.id, next))
                  .then((ok) => ok && toast.success(next ? 'Shared with the homeowner' : 'Homeowner sharing removed'))
              }}
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">Share with the homeowner (read-only)</span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                Linked homeowners see this question, its official answers, and their files. Comments, history, and every other project
                record stay private.
              </span>
            </span>
          </label>
          <ActionError failure={share.failure} onReload={onChanged} />
        </div>
      )}
    </PanelSection>
  )
}

function FormButtons({ pending, submitLabel, onCancel }: { pending: boolean; submitLabel: string; onCancel: () => void }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
        {pending ? 'Saving…' : submitLabel}
      </Button>
    </div>
  )
}

const INLINE_FORM_CLASS = 'flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3'

function ReasonForm({
  id,
  label,
  hint,
  required,
  submitLabel,
  submit,
  onCancel,
  onReload,
  onChanged,
  onDone,
}: {
  id: string
  label: string
  hint: string
  required: boolean
  submitLabel: string
  submit: (reason: string, requestId: string) => Promise<Outcome>
  onCancel: () => void
  onReload: () => void
  onChanged: () => void
  onDone: () => void
}) {
  const overlay = useFormOverlay()
  const action = useAction(onChanged)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  return (
    <form
      className={INLINE_FORM_CLASS}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (required && !reason.trim()) return setMissing(true)
        void action.run(() => submit(reason, requestId.current)).then((ok) => {
          if (!ok) return
          overlay?.setDirty(false)
          onDone()
        })
      }}
    >
      <TextAreaField
        name={id}
        label={label}
        required={required}
        maxLength={2000}
        autoFocus
        inputClassName="min-h-20"
        value={reason}
        error={missing ? 'Add a reason to continue.' : undefined}
        hint={hint}
        onChange={(e) => {
          setReason(e.target.value)
          setMissing(false)
          overlay?.markDirty()
        }}
      />
      <ActionError failure={action.failure} onReload={onReload} />
      <FormButtons pending={action.pending} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  )
}

function AmendForm({ rfi, onCancel, onChanged, onDone }: { rfi: RfiRecord; onCancel: () => void; onChanged: () => void; onDone: () => void }) {
  const overlay = useFormOverlay()
  const action = useAction(onChanged)
  const [values, setValues] = useState({ subject: rfi.subject, question: rfi.question, due_date: rfi.due_date ?? '', location: rfi.location ?? '' })
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const requestId = useRef(crypto.randomUUID())
  const change = (patch: Partial<typeof values>) => {
    setValues((v) => ({ ...v, ...patch }))
    setProblem(null)
    overlay?.markDirty()
  }
  return (
    <form
      className={INLINE_FORM_CLASS}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!values.subject.trim() || !values.question.trim()) return setProblem('The subject and the question are both needed.')
        if (note.trim().length < 3) return setProblem('Describe what changed so the responder knows.')
        void action.run(() => amendRfiAction(rfi.project_id, rfi.id, rfi.row_version, values, note, requestId.current)).then((ok) => {
          if (!ok) return
          overlay?.setDirty(false)
          onDone()
        })
      }}
    >
      <p className="text-xs text-muted-foreground">
        The question as first sent stays in the history. The responder is notified of the change.
      </p>
      <TextField name={`rfi-amend-subject-${rfi.id}`} label="Subject" required maxLength={200} value={values.subject} onChange={(e) => change({ subject: e.target.value })} />
      <TextAreaField name={`rfi-amend-question-${rfi.id}`} label="Question" required maxLength={10000} value={values.question} onChange={(e) => change({ question: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name={`rfi-amend-due-${rfi.id}`} label="Due date" type="date" value={values.due_date} onChange={(e) => change({ due_date: e.target.value })} />
        <TextField name={`rfi-amend-location-${rfi.id}`} label="Location" maxLength={300} value={values.location} onChange={(e) => change({ location: e.target.value })} />
      </div>
      <TextAreaField
        name={`rfi-amend-note-${rfi.id}`}
        label="What changed?"
        required
        maxLength={2000}
        inputClassName="min-h-20"
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          setProblem(null)
          overlay?.markDirty()
        }}
      />
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      <ActionError failure={action.failure} onReload={onChanged} />
      <FormButtons pending={action.pending} submitLabel="Save changes" onCancel={onCancel} />
    </form>
  )
}

function ReassignForm({ rfi, onCancel, onChanged, onDone }: { rfi: RfiRecord; onCancel: () => void; onChanged: () => void; onDone: () => void }) {
  const overlay = useFormOverlay()
  const action = useAction(onChanged)
  const options = useSWR<RfiFormOptions>(`/api/rfis/options?project=${rfi.project_id}`, fetchRfiJson, { revalidateOnFocus: false })
  const [responder, setResponder] = useState('')
  const [note, setNote] = useState('')
  const [missing, setMissing] = useState(false)
  const requestId = useRef(crypto.randomUUID())
  const choices = (options.data?.responders ?? []).filter((o) => o.eligible && o.user_id && o.user_id !== rfi.responder_user_id)
  const selectId = `rfi-reassign-${rfi.id}`
  return (
    <form
      className={INLINE_FORM_CLASS}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!responder) return setMissing(true)
        void action.run(() => reassignRfiAction(rfi.project_id, rfi.id, rfi.row_version, responder, note, requestId.current)).then((ok) => {
          if (!ok) return
          overlay?.setDirty(false)
          onDone()
        })
      }}
    >
      <FieldShell
        name={selectId}
        label="New responder"
        required
        error={missing ? 'Choose who should answer.' : options.error instanceof Error ? options.error.message : undefined}
        hint={`${rfi.responder_name ?? 'The current responder'} will no longer be able to open this question. Only people who can sign in to this project are listed.`}
      >
        <NativeSelect
          id={selectId}
          name={selectId}
          required
          value={responder}
          disabled={!options.data || action.pending}
          aria-invalid={missing ? true : undefined}
          aria-describedby={missing ? `${selectId}-error` : `${selectId}-hint`}
          onChange={(e) => {
            setResponder(e.target.value)
            setMissing(false)
            overlay?.markDirty()
          }}
        >
          <option value="">{options.data ? (choices.length ? 'Choose who should answer' : 'Nobody else can sign in to this project') : options.error ? 'People could not be loaded' : 'Loading people…'}</option>
          {choices.map((o) => (
            <option key={o.option_key} value={o.user_id ?? ''}>
              {o.company_name ? `${o.full_name} · ${o.company_name}` : o.full_name}
            </option>
          ))}
        </NativeSelect>
      </FieldShell>
      <TextAreaField
        name={`rfi-reassign-note-${rfi.id}`}
        label="Note"
        maxLength={2000}
        inputClassName="min-h-20"
        hint="Optional. Recorded in the history."
        value={note}
        onChange={(e) => {
          setNote(e.target.value)
          overlay?.markDirty()
        }}
      />
      <ActionError failure={action.failure} onReload={onChanged} />
      <FormButtons pending={action.pending} submitLabel="Reassign" onCancel={onCancel} />
    </form>
  )
}

function Comments({ detail, onChanged }: { detail: RfiDetail; onChanged: () => void }) {
  const { rfi, comments } = detail
  const overlay = useFormOverlay()
  const action = useAction(onChanged)
  const [body, setBody] = useState('')
  // A retried post reuses this id, so the same comment is never stored twice.
  const commentId = useRef(crypto.randomUUID())
  const fieldId = `rfi-comment-${rfi.id}`
  return (
    <PanelSection title="Comments" aside={<span className="text-xs text-muted-foreground">Discussion only</span>}>
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comment.author_name}</span> · {formatDateTime(comment.created_at)}
              </p>
              <p className={BODY_CLASS}>{comment.body}</p>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          if (!body.trim()) return
          void action.run(() => commentRfiAction(rfi.project_id, rfi.id, commentId.current, body)).then((ok) => {
            if (!ok) return
            commentId.current = crypto.randomUUID()
            setBody('')
            overlay?.setDirty(false)
          })
        }}
      >
        <label htmlFor={fieldId} className="sr-only">
          Add a comment
        </label>
        <Textarea
          id={fieldId}
          value={body}
          maxLength={4000}
          placeholder="Add a comment"
          aria-describedby={`${fieldId}-hint`}
          className="min-h-20"
          onChange={(e) => {
            setBody(e.target.value)
            overlay?.markDirty()
          }}
        />
        <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
          A comment is not the official answer and does not change the status.
        </p>
        <ActionError failure={action.failure} onReload={onChanged} />
        <Button type="submit" variant="outline" className="w-full sm:w-fit" disabled={action.pending || !body.trim()}>
          {action.pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {action.pending ? 'Posting…' : 'Add comment'}
        </Button>
      </form>
    </PanelSection>
  )
}

const CHANGE_LABELS: Record<string, string> = { subject: 'Subject', question: 'Question', due_date: 'Due date', location: 'Location' }

function HistoryEntry({ event }: { event: RfiEvent }) {
  const before = (event.details.before ?? null) as Record<string, string | null> | null
  const after = (event.details.after ?? null) as Record<string, string | null> | null
  const changed = before && after ? Object.keys(CHANGE_LABELS).filter((k) => (before[k] ?? '') !== (after[k] ?? '')) : []
  return (
    <li className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
      <p className="text-sm font-medium text-foreground">{rfiEventSummary(event)}</p>
      <p className="text-xs text-muted-foreground">
        {event.actor_name} · {formatDateTime(event.created_at)}
        {event.internal && ' · Visible to builder staff only'}
      </p>
      {event.note && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{`“${event.note}”`}</p>}
      {changed.length > 0 && before && after && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
            Show what changed
          </summary>
          <dl className="mt-1 flex flex-col gap-2">
            {changed.map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <dt className="text-xs font-medium text-foreground">{CHANGE_LABELS[key]}</dt>
                <dd className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                  <span className="sr-only">Before: </span>
                  <span className="line-through">{before[key] || 'None'}</span>
                </dd>
                <dd className="whitespace-pre-wrap break-words text-xs text-foreground">
                  <span className="sr-only">After: </span>
                  {after[key] || 'None'}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </li>
  )
}
