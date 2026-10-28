import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.hellosign.com/v3'

export type ProviderConfig = {
  configured: boolean
  embeddedAvailable: boolean
  clientId: string | null
  testMode: boolean
}

/** Credentials never leave the server. Only the client ID (public by design) is sent to the browser for embedded signing. */
export function getProviderConfig(): ProviderConfig {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY?.trim()
  const clientId = process.env.DROPBOX_SIGN_CLIENT_ID?.trim() || null
  return {
    configured: Boolean(apiKey),
    embeddedAvailable: Boolean(apiKey && clientId),
    clientId,
    testMode: process.env.DROPBOX_SIGN_TEST_MODE?.trim().toLowerCase() !== 'false',
  }
}

function apiKey() {
  const key = process.env.DROPBOX_SIGN_API_KEY?.trim()
  if (!key) throw new ProviderError('Dropbox Sign is not configured.', 'not_configured')
  return key
}

export class ProviderError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) {
    super(message)
  }
}

export type ProviderSignature = {
  signature_id: string
  signer_email_address: string
  signer_name: string
  order: number | null
  status_code: string
  signed_at: number | null
  last_viewed_at: number | null
  decline_reason?: string | null
}

export type ProviderSignatureRequest = {
  signature_request_id: string
  title: string
  is_complete: boolean
  is_declined: boolean
  has_error: boolean
  test_mode: boolean
  expires_at: number | null
  created_at?: number
  metadata?: Record<string, string>
  signatures: ProviderSignature[]
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${Buffer.from(`${apiKey()}:`).toString('base64')}`, ...init.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    let message = `Dropbox Sign returned ${res.status}.`
    let code = 'provider_error'
    try {
      const body = (await res.json()) as { error?: { error_msg?: string; error_name?: string } }
      if (body.error?.error_msg) message = body.error.error_msg
      if (body.error?.error_name) code = body.error.error_name
    } catch {}
    throw new ProviderError(message, code, res.status)
  }
  return res
}

export async function createSignatureRequest(input: {
  embedded: boolean
  title: string
  message: string | null
  ordered: boolean
  signers: { name: string; email: string }[]
  file: Uint8Array
  filename: string
  metadata: Record<string, string>
}): Promise<ProviderSignatureRequest> {
  const config = getProviderConfig()
  const form = new FormData()
  form.set('title', input.title)
  form.set('subject', input.title)
  if (input.message) form.set('message', input.message)
  form.set('test_mode', config.testMode ? '1' : '0')
  form.set('use_text_tags', '1')
  form.set('hide_text_tags', '1')
  input.signers.forEach((s, i) => {
    form.set(`signers[${i}][name]`, s.name)
    form.set(`signers[${i}][email_address]`, s.email)
    if (input.ordered) form.set(`signers[${i}][order]`, String(i))
  })
  Object.entries(input.metadata).forEach(([k, v]) => form.set(`metadata[${k}]`, v))
  form.set('files[0]', new Blob([input.file as BlobPart], { type: 'application/pdf' }), input.filename)
  if (input.embedded) {
    if (!config.clientId) throw new ProviderError('Embedded signing needs DROPBOX_SIGN_CLIENT_ID.', 'not_configured')
    form.set('client_id', config.clientId)
  }
  const res = await request(input.embedded ? '/signature_request/create_embedded' : '/signature_request/send', { method: 'POST', body: form })
  return ((await res.json()) as { signature_request: ProviderSignatureRequest }).signature_request
}

export async function getSignatureRequest(id: string): Promise<ProviderSignatureRequest> {
  const res = await request(`/signature_request/${encodeURIComponent(id)}`)
  return ((await res.json()) as { signature_request: ProviderSignatureRequest }).signature_request
}

export async function getEmbeddedSignUrl(signatureId: string): Promise<{ signUrl: string; expiresAt: number }> {
  const res = await request(`/embedded/sign_url/${encodeURIComponent(signatureId)}`)
  const body = (await res.json()) as { embedded: { sign_url: string; expires_at: number } }
  return { signUrl: body.embedded.sign_url, expiresAt: body.embedded.expires_at * 1000 }
}

export async function cancelSignatureRequest(id: string): Promise<void> {
  await request(`/signature_request/cancel/${encodeURIComponent(id)}`, { method: 'POST' })
}

/** Final PDF with the Dropbox Sign audit trail appended. Throws `files_not_ready` while the provider is still finalizing. */
export async function downloadSignedPdf(id: string): Promise<Uint8Array> {
  let res: Response
  try {
    res = await request(`/signature_request/files/${encodeURIComponent(id)}?file_type=pdf`)
  } catch (e) {
    if (e instanceof ProviderError && e.status === 409) throw new ProviderError('Dropbox Sign is still preparing the signed PDF.', 'files_not_ready', 409)
    throw e
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new ProviderError('Dropbox Sign did not return a PDF file.', 'invalid_file')
  }
  return bytes
}

export type ProviderEvent = {
  event: {
    event_time: string
    event_type: string
    event_hash: string
    event_metadata?: { related_signature_id?: string | null }
  }
  signature_request?: ProviderSignatureRequest
}

/** Dropbox Sign signs each callback with HMAC-SHA256(api key, event_time + event_type). */
export function verifyProviderEvent(payload: ProviderEvent): boolean {
  const key = process.env.DROPBOX_SIGN_API_KEY?.trim()
  const { event_time, event_type, event_hash } = payload.event ?? {}
  if (!key || !event_time || !event_type || typeof event_hash !== 'string') return false
  const expected = createHmac('sha256', key).update(event_time + event_type).digest('hex')
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(event_hash, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}
