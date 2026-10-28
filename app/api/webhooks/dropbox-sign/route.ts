import { createAdminClient } from '@/lib/supabase/admin'
import { getSignatureRequest, verifyProviderEvent, type ProviderEvent } from '@/lib/esign/dropbox-sign'
import { applyProviderState, recordEvent } from '@/lib/esign/sync'
import type { SignatureStatus } from '@/lib/signatures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dropbox Sign treats any other response body as a failed delivery and retries.
const ACK = 'Hello API Event Received'

const OVERRIDES: Record<string, SignatureStatus> = {
  signature_request_canceled: 'cancelled',
  signature_request_expired: 'expired',
  signature_request_invalid: 'failed',
  file_error: 'failed',
}

export async function POST(request: Request) {
  let payload: ProviderEvent
  try {
    const form = await request.formData()
    const raw = form.get('json')
    if (typeof raw !== 'string' || raw.length > 1_000_000) return new Response('Bad request', { status: 400 })
    payload = JSON.parse(raw)
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (!verifyProviderEvent(payload)) return new Response('Invalid signature', { status: 401 })
  const { event } = payload
  if (event.event_type === 'callback_test') return new Response(ACK)

  const providerId = payload.signature_request?.signature_request_id
  if (!providerId) return new Response(ACK)

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('signature_requests')
    .select('id, organization_id, project_id, status, title, requested_by, signed_storage_path')
    .eq('provider_request_id', providerId)
    .maybeSingle()
  // Unknown requests (e.g. sent outside this app) are acknowledged so the provider stops retrying.
  if (!row) return new Response(ACK)

  try {
    await recordEvent(admin, row, {
      key: `dbs:${event.event_hash}`,
      type: event.event_type,
      time: new Date(Number(event.event_time) * 1000),
      signatureId: event.event_metadata?.related_signature_id ?? null,
      source: 'webhook',
    })
    // Always reconcile, even for a duplicate event: state application is idempotent and a retry may follow a failed attempt.
    const sr = payload.signature_request?.signatures ? payload.signature_request : await getSignatureRequest(providerId)
    await applyProviderState(admin, row, sr, OVERRIDES[event.event_type])
  } catch (e) {
    console.error('[esign] webhook processing failed', row.id, e instanceof Error ? e.message : e)
    return new Response('Processing failed', { status: 500 })
  }
  return new Response(ACK)
}
