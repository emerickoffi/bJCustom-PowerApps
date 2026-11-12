import { isAllowedRecipient, isValidEmailAddress, type EmailConfig } from './config.ts'
import { renderEmail, type OutboxRow } from './templates.ts'
import type { Sender } from './resend.ts'

export type CompleteOutcome =
  | { outcome: 'accepted'; messageId: string }
  | { outcome: 'retry' | 'failed' | 'skipped'; error: string }

export interface EmailOutboxStore {
  /** Atomically moves due rows to `sending` for this worker (FOR UPDATE SKIP LOCKED in SQL). */
  claim(worker: string, limit: number): Promise<OutboxRow[]>
  /** Returns false when the row is no longer locked by this worker. */
  complete(id: number, worker: string, result: CompleteOutcome): Promise<boolean>
}

export type DispatchSummary = {
  ran: boolean
  reason?: string
  claimed: number
  accepted: number
  retried: number
  failed: number
  skipped: number
}

export async function dispatchEmailBatch(options: {
  store: EmailOutboxStore
  send: Sender
  config: EmailConfig
  worker: string
  limit?: number
}): Promise<DispatchSummary> {
  const { store, send, config, worker } = options
  const summary: DispatchSummary = { ran: false, claimed: 0, accepted: 0, retried: 0, failed: 0, skipped: 0 }
  // Rows stay queued while email is not configured, and send once it is.
  if (!config.ready || !config.from || !config.appUrl) {
    return { ...summary, reason: 'email_not_configured' }
  }

  const rows = await store.claim(worker, options.limit ?? 25)
  summary.ran = true
  summary.claimed = rows.length

  for (const row of rows) {
    const result = await processRow(row, send, config)
    await store.complete(row.id, worker, result)
    if (result.outcome === 'accepted') summary.accepted++
    else if (result.outcome === 'skipped') summary.skipped++
    else if (result.outcome === 'retry' && row.attempts < row.max_attempts) summary.retried++
    else summary.failed++
  }
  return summary
}

async function processRow(row: OutboxRow, send: Sender, config: EmailConfig): Promise<CompleteOutcome> {
  const to = row.recipient_email?.trim()
  if (!isValidEmailAddress(to)) return { outcome: 'failed', error: 'invalid_recipient_address' }
  if (!isAllowedRecipient(to, config.allowlist)) return { outcome: 'skipped', error: 'recipient_not_in_test_allowlist' }

  const rendered = renderEmail(row, config.appUrl!)
  if (!rendered.ok) return { outcome: 'failed', error: rendered.error }

  return send(
    {
      from: config.from!,
      to,
      replyTo: config.replyTo,
      subject: rendered.email.subject,
      html: rendered.email.html,
      text: rendered.email.text,
      tags: [
        { name: 'category', value: row.category.replace(/[^a-z0-9_-]/gi, '_') },
        { name: 'template', value: row.template },
      ],
    },
    `trefort-${row.event_key}`,
  )
}
