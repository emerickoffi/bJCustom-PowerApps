/**
 * Pure helpers shared by the browser and the server for interruption-safe saves.
 *
 * A "logical save" is one press of Save with one exact payload. It carries a stable request id so a
 * retry after a dropped response is recognised by the server instead of creating a second record.
 */

export const SAVE_REQUEST_FIELD = '_request_id'
export const SAVE_EXPECTED_USER_FIELD = '_expected_user'
export const SAVE_RESILIENT_FIELD = '_resilient'

export type SaveKind = 'daily_log' | 'change_order' | 'estimate'

/** Fields that steer the request but are not part of the saved data. */
const CONTROL_FIELDS = new Set([SAVE_REQUEST_FIELD, SAVE_EXPECTED_USER_FIELD, SAVE_RESILIENT_FIELD, 'intent'])

export function isControlField(key: string) {
  return CONTROL_FIELDS.has(key) || key.startsWith('$ACTION')
}

/** Keeps only string data fields, in a stable order (by key, preserving order within repeated keys). */
export function payloadEntries(entries: Iterable<[string, unknown]>): [string, string][] {
  const kept: [string, string][] = []
  for (const [k, v] of entries) if (typeof v === 'string' && !isControlField(k)) kept.push([k, v])
  return kept.map((e, i) => [e, i] as const).sort((a, b) => (a[0][0] < b[0][0] ? -1 : a[0][0] > b[0][0] ? 1 : a[1] - b[1])).map(([e]) => e)
}

export function canonicalPayload(entries: Iterable<[string, unknown]>): string {
  return JSON.stringify(payloadEntries(entries))
}

/** Small non-cryptographic 53-bit hash, used only to compare payloads on one device. */
export function fingerprint(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

export type PendingSave = { requestId: string; fingerprint: string; startedAt: number }

/** Reuse the id only when retrying the identical payload; any change is a new logical save. */
export function resolveRequestId(pending: PendingSave | undefined | null, payloadFingerprint: string, makeId: () => string): string {
  return pending && pending.fingerprint === payloadFingerprint ? pending.requestId : makeId()
}

export type DraftScope = { userId: string; orgId: string; formType: string; projectId?: string | null; recordId?: string | null }

/** Drafts are keyed by user, organization, form, project and record so they never cross accounts. */
export function draftKey(s: DraftScope): string {
  return ['v1', s.userId, s.orgId, s.formType, s.projectId || '-', s.recordId || 'new'].join(':')
}

const CONFLICT_PATTERNS = [/changed by someone else/i, /updated by someone else/i]
export function isConflictMessage(message: string | undefined | null) {
  return Boolean(message && CONFLICT_PATTERNS.some((p) => p.test(message)))
}

export type ThrownSaveError = { kind: 'auth' | 'redirect' | 'forbidden' | 'network'; location?: string }

const AUTH_PATHS = ['/auth/login', '/no-access', '/account/activate']

/** Classifies what a server-action call threw. Anything unrecognised is treated as an unconfirmed network outcome. */
export function classifyThrown(error: unknown): ThrownSaveError {
  const digest = typeof error === 'object' && error && 'digest' in error ? String((error as { digest: unknown }).digest) : ''
  if (digest.startsWith('NEXT_REDIRECT')) {
    const location = digest.split(';')[2] ?? ''
    return AUTH_PATHS.some((p) => location.startsWith(p)) ? { kind: 'auth', location } : { kind: 'redirect', location }
  }
  if (digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;403') || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK;404') || digest === 'NEXT_NOT_FOUND') {
    return { kind: 'forbidden' }
  }
  return { kind: 'network' }
}
