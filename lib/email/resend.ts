export type EmailMessage = {
  from: string
  to: string
  replyTo?: string | null
  subject: string
  html: string
  text: string
  tags?: { name: string; value: string }[]
}

export type SendResult =
  | { outcome: 'accepted'; messageId: string }
  | { outcome: 'retry' | 'failed'; error: string }

export type Sender = (message: EmailMessage, idempotencyKey: string) => Promise<SendResult>

function errorName(body: unknown): string {
  if (body && typeof body === 'object' && 'name' in body && typeof body.name === 'string') {
    return body.name.replace(/[^a-z0-9_]/gi, '').slice(0, 60)
  }
  return 'unknown'
}

/** Rate limits, provider outages, and in-flight idempotent duplicates retry; everything else is permanent. */
export function classifyProviderResponse(status: number, body: unknown): SendResult {
  if (status >= 200 && status < 300) {
    const id = body && typeof body === 'object' && 'id' in body && typeof body.id === 'string' ? body.id : null
    return id ? { outcome: 'accepted', messageId: id } : { outcome: 'retry', error: 'provider_missing_message_id' }
  }
  const name = errorName(body)
  const error = `provider_${status}_${name}`
  if (status === 429 || status >= 500) return { outcome: 'retry', error }
  if (status === 409 && name === 'concurrent_idempotent_requests') return { outcome: 'retry', error }
  return { outcome: 'failed', error }
}

export function createResendSender(apiKey: string, fetchImpl: typeof fetch = fetch, timeoutMs = 15_000): Sender {
  return async (message, idempotencyKey) => {
    try {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // Resend dedupes the same key for 24 hours, so a retried or reclaimed row cannot double-send.
          'Idempotency-Key': idempotencyKey.slice(0, 256),
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          reply_to: message.replyTo || undefined,
          subject: message.subject,
          html: message.html,
          text: message.text,
          tags: message.tags,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      return classifyProviderResponse(response.status, body)
    } catch (error) {
      const name = error instanceof Error ? error.name : 'network_error'
      return { outcome: 'retry', error: `provider_unreachable_${name}`.slice(0, 120) }
    }
  }
}
