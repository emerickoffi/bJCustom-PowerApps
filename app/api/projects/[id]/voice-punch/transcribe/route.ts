import { NextResponse, type NextRequest } from 'next/server'
import { transcribe } from 'ai'
import { NO_STORE, authorizeVoiceRequest, isTimeout, voiceFail } from '@/lib/ai/voice-punch-server'
import { ALLOWED_AUDIO_TYPES, VOICE_LIMITS, baseMime } from '@/lib/voice-punch'

export const runtime = 'nodejs'
export const maxDuration = 60

const TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe'

/** Audio is held in memory for this request only and is never written to storage or logs. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const length = Number(request.headers.get('content-length') ?? 0)
  if (length > VOICE_LIMITS.maxBytes + 64 * 1024) return voiceFail(413, 'too_large', 'That recording is too long. Keep it under 90 seconds.')

  const form = await request.formData().catch(() => null)
  const audio = form?.get('audio')
  const seconds = Number(form?.get('seconds'))
  if (!(audio instanceof Blob)) return voiceFail(400, 'invalid_audio', 'No recording was received. Try again.')
  if (!ALLOWED_AUDIO_TYPES.has(baseMime(audio.type))) return voiceFail(415, 'unsupported_audio', 'This recording format is not supported. Type the issue instead.')
  if (audio.size < VOICE_LIMITS.minBytes) return voiceFail(422, 'empty_audio', 'The recording was empty. Try again and speak close to the phone.')
  if (audio.size > VOICE_LIMITS.maxBytes) return voiceFail(413, 'too_large', 'That recording is too long. Keep it under 90 seconds.')
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > VOICE_LIMITS.maxSeconds + 2) {
    return voiceFail(422, 'invalid_duration', 'Recordings must be under 90 seconds.')
  }

  const gate = await authorizeVoiceRequest(id, 'transcribe')
  if ('response' in gate) return gate.response

  try {
    const result = await transcribe({
      model: TRANSCRIPTION_MODEL,
      audio: new Uint8Array(await audio.arrayBuffer()),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(VOICE_LIMITS.transcribeTimeoutMs),
    })
    const text = result.text.trim().slice(0, VOICE_LIMITS.transcriptMax)
    if (!text) return voiceFail(422, 'no_speech', 'No speech was detected. Try again or type the issue.')
    return NextResponse.json({ transcript: text }, { headers: NO_STORE })
  } catch (error) {
    if (isTimeout(error)) return voiceFail(504, 'timeout', 'Transcription took too long. Your recording is kept, so you can retry.')
    console.error('[voice-punch] transcription failed', { stage: 'provider', name: error instanceof Error ? error.name : 'unknown' })
    return voiceFail(502, 'provider_error', 'Transcription is unavailable right now. Your recording is kept, so you can retry or type instead.')
  }
}
