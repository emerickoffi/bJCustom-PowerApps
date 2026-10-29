import { createHash } from 'node:crypto'

/**
 * Stable UUID derived from a seed, so registering the same signed artifact twice
 * (duplicate webhooks, manual refresh) targets the same rows instead of duplicating them.
 */
export function deterministicUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest()
  h[6] = (h[6] & 0x0f) | 0x50
  h[8] = (h[8] & 0x3f) | 0x80
  const hex = h.subarray(0, 16).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function signedDocumentIds(requestId: string) {
  return {
    documentId: deterministicUuid(`signed-document:${requestId}`),
    versionId: deterministicUuid(`signed-version:${requestId}`),
  }
}

export function signedDocumentName(sourceName: string): string {
  const suffix = ' — Signed'
  return sourceName.slice(0, 200 - suffix.length) + suffix
}

export type EstimateApprovalInput = {
  requestStatus: string
  testMode: boolean
  requestDocumentId: string | null
  requestSourceVersionId: string | null
  snapshot: { document_id: string | null; version_id: string | null } | null
  estimateStatus: string | null
  signerNames: string[]
  /** The request and the estimate must belong to the same project. Defaults to true for older callers. */
  sameProject?: boolean
  /** Estimate expiration date (YYYY-MM-DD) and the moment the last signer signed. */
  estimateExpirationDate?: string | null
  completedAt?: string | null
}

export type EstimateApprovalDecision =
  | { approve: true; decisionByName: string }
  | { approve: false; reason: 'not_completed' | 'not_estimate' | 'test_mode' | 'not_submitted' | 'no_signers' | 'expired' }

/** Signed after the last day the estimate was valid (expiration dates are whole days, inclusive). */
export function signedAfterExpiration(expirationDate: string | null | undefined, completedAt: string | null | undefined): boolean {
  if (!expirationDate || !completedAt) return false
  const completedDay = new Date(completedAt).toISOString().slice(0, 10)
  return completedDay > expirationDate.slice(0, 10)
}

/**
 * An estimate is approved by signature only when the completed request signed the exact
 * signing copy (document and version) generated for that estimate revision, outside test mode,
 * while the estimate is awaiting a decision. Every other signature request leaves estimates alone.
 */
export function estimateApprovalFromSignature(input: EstimateApprovalInput): EstimateApprovalDecision {
  if (input.requestStatus !== 'completed') return { approve: false, reason: 'not_completed' }
  const { snapshot } = input
  if (
    !snapshot?.document_id ||
    !snapshot.version_id ||
    snapshot.document_id !== input.requestDocumentId ||
    snapshot.version_id !== input.requestSourceVersionId ||
    input.sameProject === false
  ) {
    return { approve: false, reason: 'not_estimate' }
  }
  if (input.testMode) return { approve: false, reason: 'test_mode' }
  if (input.estimateStatus !== 'submitted') return { approve: false, reason: 'not_submitted' }
  if (signedAfterExpiration(input.estimateExpirationDate, input.completedAt)) return { approve: false, reason: 'expired' }
  const names = [...new Set(input.signerNames.map((n) => n.trim()).filter(Boolean))]
  if (names.length === 0) return { approve: false, reason: 'no_signers' }
  return { approve: true, decisionByName: names.join(', ').slice(0, 160) }
}
