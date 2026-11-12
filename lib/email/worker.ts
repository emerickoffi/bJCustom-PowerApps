import 'server-only'
import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEmailConfig } from './config'
import { dispatchEmailBatch, type DispatchSummary, type EmailOutboxStore } from './dispatch'
import { createResendSender } from './resend'
import type { OutboxRow, OutboxTemplate } from './templates'

function supabaseStore(): EmailOutboxStore {
  const admin = createAdminClient()
  return {
    async claim(worker, limit) {
      const { data, error } = await admin.rpc('claim_email_outbox', { p_worker: worker, p_limit: limit })
      if (error) throw new Error(`claim_email_outbox failed: ${error.code ?? 'unknown'}`)
      return (data ?? []) as OutboxRow[]
    },
    async complete(id, worker, result) {
      const { data, error } = await admin.rpc('complete_email_outbox', {
        p_id: id,
        p_worker: worker,
        p_outcome: result.outcome,
        p_message_id: result.outcome === 'accepted' ? result.messageId : null,
        p_error: result.outcome === 'accepted' ? null : result.error,
      })
      if (error) console.error('[email] complete_email_outbox failed', { id, code: error.code })
      return data === true
    },
  }
}

/** Drains due outbox rows in a few bounded batches so one invocation stays well under the function timeout. */
export async function runEmailDispatch(maxBatches = 4): Promise<DispatchSummary> {
  const config = resolveEmailConfig()
  const total: DispatchSummary = { ran: false, claimed: 0, accepted: 0, retried: 0, failed: 0, skipped: 0 }
  if (!config.ready || !config.apiKey) return { ...total, reason: 'email_not_configured' }

  const store = supabaseStore()
  const send = createResendSender(config.apiKey)
  const worker = `w_${crypto.randomUUID()}`
  for (let i = 0; i < maxBatches; i++) {
    const batch = await dispatchEmailBatch({ store, send, config, worker, limit: 25 })
    total.ran = true
    total.claimed += batch.claimed
    total.accepted += batch.accepted
    total.retried += batch.retried
    total.failed += batch.failed
    total.skipped += batch.skipped
    if (batch.claimed < 25) break
  }
  if (total.failed > 0) console.error('[email] dispatch had permanent failures', { failed: total.failed })
  return total
}

/** Sends right after the response instead of waiting for the next cron tick. Cron remains the safety net. */
export function kickEmailDispatch() {
  if (!resolveEmailConfig().ready) return
  after(async () => {
    try {
      await runEmailDispatch(1)
    } catch (error) {
      console.error('[email] immediate dispatch failed', error instanceof Error ? error.message : error)
    }
  })
}

/**
 * Queues an account email (invitation / portal access) that is not tied to a notifications row.
 * Call it only after the business change succeeded. Duplicate event keys are ignored.
 */
export async function queueAccountEmail(input: {
  eventKey: string
  organizationId: string
  userId?: string | null
  email: string
  template: Exclude<OutboxTemplate, 'notification'>
  payload: Record<string, unknown>
}): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organizations')
      .select('display_name')
      .eq('id', input.organizationId)
      .maybeSingle()
    const { error } = await admin.from('email_outbox').upsert(
      {
        event_key: input.eventKey,
        organization_id: input.organizationId,
        user_id: input.userId ?? null,
        recipient_email: input.email.trim().toLowerCase(),
        category: 'account',
        template: input.template,
        payload: { ...input.payload, organization_name: org?.display_name ?? null },
      },
      { onConflict: 'event_key', ignoreDuplicates: true },
    )
    if (error) {
      console.error('[email] queueAccountEmail failed', { template: input.template, code: error.code })
      return false
    }
    kickEmailDispatch()
    return true
  } catch (error) {
    console.error('[email] queueAccountEmail failed', error instanceof Error ? error.message : error)
    return false
  }
}

/** Stops queued account emails whose links were replaced or revoked. */
export async function supersedeQueuedEmails(organizationId: string, eventKeyPrefix: string) {
  try {
    const admin = createAdminClient()
    await admin
      .from('email_outbox')
      .update({ status: 'skipped', skip_reason: 'superseded', payload: {}, updated_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('status', 'queued')
      .like('event_key', `${eventKeyPrefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  } catch (error) {
    console.error('[email] supersedeQueuedEmails failed', error instanceof Error ? error.message : error)
  }
}
