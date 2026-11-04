import 'server-only'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import type { ActionState } from '@/lib/action-state'
import { canonicalPayload, isConflictMessage, SAVE_EXPECTED_USER_FIELD, SAVE_REQUEST_FIELD, SAVE_RESILIENT_FIELD, type SaveKind } from '@/lib/save-requests'

type Supabase = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>
type DbError = { code?: string; message?: string } | null

export type SaveRequest = { id: string | null; hash: string; resilient: boolean; expectedUser: string | null }

export function readSaveRequest(formData: FormData): SaveRequest {
  const id = z.uuid().safeParse(formData.get(SAVE_REQUEST_FIELD))
  const expected = z.uuid().safeParse(formData.get(SAVE_EXPECTED_USER_FIELD))
  return {
    id: id.success ? id.data : null,
    hash: createHash('sha256').update(canonicalPayload(formData.entries())).digest('hex'),
    resilient: formData.get(SAVE_RESILIENT_FIELD) === '1',
    expectedUser: expected.success ? expected.data : null,
  }
}

/**
 * Runs before the redirecting `require*` guards so an expired session or switched account pauses the save
 * with entries intact, instead of navigating to sign-in and dropping the form.
 */
export async function guardSaveSession(req: SaveRequest): Promise<ActionState | null> {
  if (!req.resilient) return null
  const session = await getSession()
  if (!session) return { error: 'Your session ended. Sign in again in another tab, then press Save. Your entries are kept.', authRequired: true }
  if (req.expectedUser && req.expectedUser !== session.userId) {
    return { error: 'This device is now signed in as a different user. Sign back in as the original user to save these entries.', authRequired: true }
  }
  return null
}

/** True when the idempotency migration has not been applied, so callers fall back to the original save. */
export function isMissingSaveLedger(error: DbError) {
  return Boolean(error && ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error.code ?? ''))
}

/** Looks up a committed save for this user. 'unavailable' means the ledger does not exist yet. */
export async function findCommittedSave(supabase: Supabase, requestId: string, kind: SaveKind, hash?: string): Promise<string | null | 'unavailable'> {
  const { data, error } = await supabase
    .from('client_save_requests')
    .select('record_id, payload_hash')
    .eq('request_id', requestId)
    .eq('kind', kind)
    .maybeSingle()
  if (error) return isMissingSaveLedger(error) ? 'unavailable' : null
  if (!data || (hash && data.payload_hash !== hash)) return null
  return data.record_id as string
}

/**
 * Prefers the tracked RPC; if it errors, checks whether the identical request already committed (for
 * example a concurrent tab) before reporting failure. Falls back to the original save when the ledger
 * migration is not applied.
 */
export async function runTrackedSave(opts: {
  supabase: Supabase
  req: SaveRequest
  kind: SaveKind
  tracked: (id: string) => PromiseLike<{ data: unknown; error: DbError }>
  untracked: () => PromiseLike<{ data: unknown; error: DbError }>
}): Promise<{ id: string | null; error: DbError; conflict: boolean }> {
  const { supabase, req, kind } = opts
  if (req.id) {
    const r = await opts.tracked(req.id)
    if (!r.error && r.data) return { id: r.data as string, error: null, conflict: false }
    if (!isMissingSaveLedger(r.error)) {
      const committed = await findCommittedSave(supabase, req.id, kind, req.hash)
      if (typeof committed === 'string' && committed !== 'unavailable') return { id: committed, error: null, conflict: false }
      return { id: null, error: r.error, conflict: isConflictMessage(r.error?.message) }
    }
  }
  const r = await opts.untracked()
  return { id: (r.data as string) ?? null, error: r.error, conflict: isConflictMessage(r.error?.message) }
}
