'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Mic, RotateCcw, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VOICE_LIMITS, pickRecordingMime } from '@/lib/voice'

type Status = 'idle' | 'requesting' | 'recording' | 'transcribing' | 'transcript' | 'preparing'

export function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export async function postJson<T>(url: string, init: RequestInit, timeoutMs: number, signal: AbortSignal): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('You appear to be offline. Nothing was sent; retry when you have signal.')
  let res: Response
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(error instanceof Error && error.name === 'TimeoutError' ? 'The request timed out. Retry when your connection is stable.' : 'The connection dropped. Nothing was lost; retry when you have signal.')
  }
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null
  if (!res.ok || !body) throw new Error(body?.error ?? 'Something went wrong. Try again or type it instead.')
  return body
}

/**
 * Records speech, transcribes it, and lets the user correct the transcript before a feature turns it
 * into a draft. Shared by every voice-drafting feature; nothing is saved here.
 */
export function VoiceCapture({
  projectId,
  title,
  fileName,
  transcriptMax = VOICE_LIMITS.transcriptMax,
  hasDraft,
  onPrepare,
  onClear,
  disabled,
  children,
}: {
  projectId: string
  title: string
  /** Base name for the uploaded recording, e.g. "punch-note". */
  fileName: string
  /** Cap for the joined transcript when several recordings are added together. */
  transcriptMax?: number
  /** True once a draft has been applied, so the button reads "again". */
  hasDraft: boolean
  /** Turns the transcript into a draft. Throw an Error with a user-facing message on failure. */
  onPrepare: (transcript: string, signal: AbortSignal) => Promise<void>
  /** Called when the transcript changes from a new recording or is cleared, so stale review notes go away. */
  onClear: () => void
  disabled?: boolean
  /** The feature's review panel, shown under the transcript. */
  children?: React.ReactNode
}) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [transcript, setTranscript] = useState('')
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

  const full = transcript.length >= transcriptMax

  async function start() {
    if (status === 'requesting' || status === 'recording') return
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Type it below instead.')
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
          ? 'Microphone access was blocked. Allow it in your browser settings, or type it below.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Type it below instead.'
            : 'The microphone could not be started. Type it below instead.',
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
    body.append('audio', recording.blob, `${fileName}.${ext}`)
    body.append('seconds', String(recording.seconds))
    try {
      const res = await postJson<{ transcript: string }>(
        `/api/projects/${projectId}/voice/transcribe`,
        { method: 'POST', body },
        VOICE_LIMITS.transcribeTimeoutMs + 10_000,
        controller.signal,
      )
      setTranscript((prev) => (prev.trim() ? `${prev.trim()} ${res.transcript}` : res.transcript).slice(0, transcriptMax))
      recordingRef.current = null
      setHasRecording(false)
      onClear()
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

  async function prepare() {
    if (status === 'preparing' || !transcript.trim()) return
    setStatus('preparing')
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await onPrepare(transcript.trim(), controller.signal)
      setStatus('transcript')
    } catch (e) {
      if (controller.signal.aborted) return
      setError(e instanceof Error ? e.message : 'The draft could not be prepared.')
      setStatus('transcript')
    }
  }

  function reset() {
    abortRef.current?.abort()
    recordingRef.current = null
    setHasRecording(false)
    setTranscript('')
    onClear()
    setError(null)
    setStatus('idle')
  }

  const busy = status === 'requesting' || status === 'recording' || status === 'transcribing' || status === 'preparing'

  return (
    <section aria-label="Voice draft" className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{`Up to ${VOICE_LIMITS.maxSeconds} seconds per recording. Audio is sent for transcription and not stored.`}</span>
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
            disabled={disabled || busy || full}
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

      {transcript !== '' && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`voice-transcript-${fileName}`} className="text-sm font-medium text-foreground">
            Transcript
          </label>
          <textarea
            id={`voice-transcript-${fileName}`}
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            maxLength={transcriptMax}
            rows={3}
            disabled={status === 'preparing' || status === 'transcribing'}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            {full ? 'The transcript is full. Prepare the draft, or clear it to record again.' : 'Correct any words, then prepare the draft. Fields you already typed are never overwritten without asking.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="h-10" onClick={prepare} disabled={busy || !transcript.trim()}>
              {status === 'preparing' ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
              {status === 'preparing' ? 'Preparing...' : hasDraft ? 'Prepare draft again' : 'Prepare draft'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={reset} disabled={status === 'recording'}>
              <X className="size-4" aria-hidden="true" />
              Clear transcript
            </Button>
          </div>
        </div>
      )}

      {children}
    </section>
  )
}
