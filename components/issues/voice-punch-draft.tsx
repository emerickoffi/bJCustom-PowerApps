'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Mic, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { VOICE_LIMITS, mergeDecision, pickRecordingMime, type AssigneeChoice, type VoiceDraft } from '@/lib/voice-punch'

type Status = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'transcript' | 'preparing' | 'reviewed'
type FieldName = 'title' | 'description' | 'location' | 'responsible_user_id' | 'due_date'
type Conflict = { name: FieldName; label: string; value: string; display: string }
type Review = { filled: string[]; conflicts: Conflict[]; assigneeChoices: AssigneeChoice[]; notes: string[] }

const FIELD_LABELS: Record<FieldName, string> = {
  title: 'Title',
  description: 'Description',
  location: 'Location',
  responsible_user_id: 'Responsible person',
  due_date: 'Due date',
}

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

async function postJson<T>(url: string, init: RequestInit, timeoutMs: number, signal: AbortSignal): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You appear to be offline. Nothing was sent; retry when you have signal.')
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(error instanceof Error && error.name === 'TimeoutError' ? 'The request timed out. Retry when your connection is stable.' : 'The connection dropped. Nothing was lost; retry when you have signal.')
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? 'Something went wrong. Try again or type the issue.')
  return body
}

/**
 * Speak a punch item, review the transcript, then fill the surrounding report form. Nothing is saved
 * or sent to anyone here: the user still confirms with the form's own Report button.
 */
export function VoicePunchDraft({
  projectId,
  formRef,
  assignees,
  onApplied,
  disabled,
}: {
  projectId: string
  formRef: React.RefObject<HTMLFormElement | null>
  assignees: AssigneeChoice[]
  onApplied: () => void
  disabled?: boolean
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [hasRecording, setHasRecording] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedAtRef = useRef(0)
  const recordingRef = useRef<{ blob: Blob; seconds: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  function releaseMic() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(
    () => () => {
      cancelledRef.current = true
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      releaseMic()
      abortRef.current?.abort()
      recordingRef.current = null
    },
    [],
  )

  async function start() {
    if (status === 'requesting' || status === 'recording') return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Type the issue below instead.')
      return
    }
    const mime = pickRecordingMime((t) => MediaRecorder.isTypeSupported(t))
    setStatus('requesting')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      setStatus(transcript ? 'transcript' : 'idle')
      const name = e instanceof DOMException ? e.name : ''
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access was blocked. Allow it in your browser settings, or type the issue below.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Type the issue below instead.'
            : 'The microphone could not be started. Type the issue below instead.',
      )
      return
    }
    streamRef.current = stream
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    recorderRef.current = recorder
    cancelledRef.current = false
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    recorder.onstop = () => {
      releaseMic()
      if (cancelledRef.current) return
      const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
      const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })
      if (blob.size < VOICE_LIMITS.minBytes) {
        setStatus(transcript ? 'transcript' : 'idle')
        setError('The recording was empty. Try again and speak close to the phone.')
        return
      }
      recordingRef.current = { blob, seconds: Math.min(seconds, VOICE_LIMITS.maxSeconds) }
      setHasRecording(true)
      void runTranscription()
    }
    startedAtRef.current = Date.now()
    setElapsed(0)
    recorder.start()
    setStatus('recording')
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsed(secs)
      if (secs >= VOICE_LIMITS.maxSeconds && recorder.state === 'recording') recorder.stop()
    }, 250)
  }

  function stop() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function cancelRecording() {
    cancelledRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    releaseMic()
    setStatus(transcript ? 'transcript' : 'idle')
  }

  async function runTranscription() {
    const recording = recordingRef.current
    if (!recording) return
    setStatus('transcribing')
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    const body = new FormData()
    const ext = recording.blob.type.includes('mp4') ? 'm4a' : recording.blob.type.includes('ogg') ? 'ogg' : 'webm'
    body.append('audio', recording.blob, `punch-note.${ext}`)
    body.append('seconds', String(recording.seconds))
    try {
      const res = await postJson<{ transcript: string }>(
        `/api/projects/${projectId}/voice-punch/transcribe`,
        { method: 'POST', body },
        VOICE_LIMITS.transcribeTimeoutMs + 10_000,
        controller.signal,
      )
      setTranscript((prev) => (prev.trim() ? `${prev.trim()} ${res.transcript}` : res.transcript))
      recordingRef.current = null
      setHasRecording(false)
      setReview(null)
      setStatus('transcript')
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'Transcription failed.')
      setStatus(transcript ? 'transcript' : 'idle')
    }
  }

  function discardRecording() {
    abortRef.current?.abort()
    recordingRef.current = null
    setHasRecording(false)
    setError(null)
    setStatus(transcript ? 'transcript' : 'idle')
  }

  function field(name: FieldName) {
    const el = formRef.current?.elements.namedItem(name)
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el : null
  }

  function setField(name: FieldName, value: string) {
    const el = field(name)
    if (!el) return
    el.value = value
    if (name === 'location' || name === 'responsible_user_id' || name === 'due_date') {
      const details = el.closest('details')
      if (details) details.open = true
    }
    onApplied()
  }

  function applyDraft(draft: VoiceDraft) {
    const filled: string[] = []
    const conflicts: Conflict[] = []
    const notes: string[] = []
    const consider = (name: FieldName, value: string, display = value) => {
      const decision = mergeDecision(field(name)?.value ?? '', value)
      if (decision === 'fill') {
        setField(name, value)
        filled.push(FIELD_LABELS[name])
      } else if (decision === 'conflict') {
        conflicts.push({ name, label: FIELD_LABELS[name], value, display })
      }
    }
    consider('title', draft.title)
    consider('description', draft.description)
    consider('location', draft.location)

    let assigneeChoices: AssigneeChoice[] = []
    if (draft.assignee.mention) {
      if (draft.assignee.matches.length === 1) {
        consider('responsible_user_id', draft.assignee.matches[0].value, draft.assignee.matches[0].label)
      } else if (draft.assignee.matches.length > 1) {
        assigneeChoices = draft.assignee.matches
      } else {
        notes.push(
          `You said to assign it to “${draft.assignee.mention}”, but nobody by that name can own issues on this project. It stays unassigned; a subcontractor can be assigned from the issue page after you report it.`,
        )
      }
    }

    if (draft.dueDate.phrase) {
      if (draft.dueDate.date && !draft.dueDate.needsReview) {
        consider('due_date', draft.dueDate.date, `${formatDate(draft.dueDate.date)} (from “${draft.dueDate.phrase}”)`)
        if (field('due_date')?.value === draft.dueDate.date) notes.push(`Due date set to ${formatDate(draft.dueDate.date)} from “${draft.dueDate.phrase}”. Check it is right.`)
      } else {
        notes.push(`“${draft.dueDate.phrase}” could not be turned into one exact date. Pick the due date below.`)
      }
    }

    setReview({ filled, conflicts, assigneeChoices, notes })
  }

  async function prepareDraft() {
    if (status === 'preparing' || !transcript.trim()) return
    setStatus('preparing')
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await postJson<{ draft: VoiceDraft }>(
        `/api/projects/${projectId}/voice-punch/draft`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: transcript.trim(), today: localToday(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        },
        VOICE_LIMITS.extractTimeoutMs + 10_000,
        controller.signal,
      )
      applyDraft(res.draft)
      setStatus('reviewed')
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'The draft could not be prepared.')
      setStatus('transcript')
    }
  }

  function resolveConflict(conflict: Conflict, replace: boolean) {
    if (replace) setField(conflict.name, conflict.value)
    setReview((r) => (r ? { ...r, conflicts: r.conflicts.filter((c) => c.name !== conflict.name) } : r))
  }

  function chooseAssignee(choice: AssigneeChoice) {
    setField('responsible_user_id', choice.value)
    setReview((r) => (r ? { ...r, assigneeChoices: [], filled: [...r.filled, FIELD_LABELS.responsible_user_id] } : r))
  }

  function reset() {
    abortRef.current?.abort()
    recordingRef.current = null
    setHasRecording(false)
    setTranscript('')
    setReview(null)
    setError(null)
    setStatus('idle')
  }

  const busy = status === 'requesting' || status === 'recording' || status === 'transcribing' || status === 'preparing'
  const showPanel = status !== 'idle' || Boolean(error) || Boolean(transcript)

  return (
    <section aria-label="Voice draft" className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">Speak the issue</span>
          <span className="text-xs text-muted-foreground">{`Up to ${VOICE_LIMITS.maxSeconds} seconds. Audio is sent for transcription and not stored.`}</span>
        </div>
        {status === 'recording' ? (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" className="h-10" onClick={stop}>
              <Square className="size-4" aria-hidden="true" />
              Stop
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={cancelRecording}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10"
            onClick={start}
            disabled={disabled || busy}
            aria-label={transcript ? 'Record more' : 'Start voice recording'}
          >
            {status === 'requesting' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
            {status === 'requesting' ? 'Starting...' : transcript ? 'Record more' : 'Record'}
          </Button>
        )}
      </div>

      <div aria-live="polite" className="contents">
        {status === 'recording' && (
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
            {`Recording ${clock(elapsed)} / ${clock(VOICE_LIMITS.maxSeconds)}`}
          </p>
        )}
        {status === 'transcribing' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Transcribing...
          </p>
        )}
        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
            {hasRecording && status !== 'transcribing' && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => void runTranscription()}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Retry transcription
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={discardRecording}>
                  Discard recording
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {showPanel && transcript !== '' && (
        <div className="flex flex-col gap-2">
          <label htmlFor="voice-transcript" className="text-sm font-medium text-foreground">
            Transcript
          </label>
          <textarea
            id="voice-transcript"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            maxLength={VOICE_LIMITS.transcriptMax}
            rows={3}
            disabled={status === 'preparing' || status === 'transcribing'}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">Correct any words, then prepare the draft. Fields you already typed are never overwritten without asking.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-10" onClick={prepareDraft} disabled={busy || !transcript.trim()}>
              {status === 'preparing' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {status === 'preparing' ? 'Preparing...' : review ? 'Prepare draft again' : 'Prepare draft'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={reset} disabled={status === 'recording'}>
              <X className="size-4" aria-hidden="true" />
              Clear transcript
            </Button>
          </div>
        </div>
      )}

      {review && (
        <div role="status" className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm">
          <p className="font-medium text-foreground">
            {review.filled.length ? `Filled: ${review.filled.join(', ')}. Review the form below before reporting.` : 'No empty fields were filled. Review the suggestions below.'}
          </p>
          {review.conflicts.map((c) => (
            <div key={c.name} className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
              <p className="text-foreground">
                <span className="font-medium">{`${c.label} already has text. `}</span>
                <span className="text-muted-foreground">{`Voice suggests: “${c.display}”`}</span>
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => resolveConflict(c, true)}>
                  Replace
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => resolveConflict(c, false)}>
                  Keep mine
                </Button>
              </div>
            </div>
          ))}
          {review.assigneeChoices.length > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
              <legend className="sr-only">Choose the responsible person</legend>
              <p className="text-foreground">Several people match the name you said. Choose one, or leave it unassigned.</p>
              <div className="flex flex-wrap gap-2">
                {review.assigneeChoices.map((a) => (
                  <Button key={a.value} type="button" size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal text-left" onClick={() => chooseAssignee(a)}>
                    {a.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
          {review.notes.map((n) => (
            <p key={n} className="text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
