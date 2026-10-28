import type { EstimateStatus } from '@/lib/estimates'

/**
 * Only locked revisions can be signed, so the signed PDF always matches an estimate nobody can edit.
 * Submitted = the homeowner is reviewing it; Approved = the decision is recorded and the revision is frozen.
 */
export const SIGNABLE_ESTIMATE_STATUSES: EstimateStatus[] = ['submitted', 'approved']

export type EstimateSigningBlock =
  | 'permission'
  | 'documents_off'
  | 'signatures_off'
  | 'setup_required'
  | 'no_project'
  | 'not_latest'
  | 'not_locked'
  | 'rejected'
  | 'no_lines'

export type EstimateSigningEligibility = { eligible: true } | { eligible: false; block: EstimateSigningBlock; reason: string }

export function estimateSigningEligibility(input: {
  status: EstimateStatus
  isLatest: boolean
  canManage: boolean
  documentsEnabled: boolean
  signaturesEnabled: boolean
  providerConfigured: boolean
  hasProject: boolean
  lineCount: number
}): EstimateSigningEligibility {
  const no = (block: EstimateSigningBlock, reason: string) => ({ eligible: false as const, block, reason })
  if (!input.canManage) return no('permission', 'Only administrators and project managers can request signatures.')
  if (!input.documentsEnabled) return no('documents_off', 'Turn on the Documents module to store signing copies with the project.')
  if (!input.signaturesEnabled) return no('signatures_off', 'Electronic signatures are turned off for your company. An administrator can turn them on in Settings → Features.')
  if (!input.providerConfigured) return no('setup_required', 'Dropbox Sign is not connected yet. An administrator needs to add DROPBOX_SIGN_API_KEY to the project environment.')
  if (!input.hasProject) return no('no_project', "This estimate's project could not be loaded, so a signing copy cannot be stored.")
  if (!input.isLatest) return no('not_latest', 'A newer revision exists. Only the latest revision can be sent for signature.')
  if (input.status === 'rejected') return no('rejected', 'Rejected revisions are kept for history. Create a revision to send a new version for signature.')
  if (input.status === 'draft' || input.status === 'internal_review') {
    return no(
      'not_locked',
      `This revision is still ${input.status === 'draft' ? 'a draft' : 'in internal review'} and can be edited. Submit it for homeowner review first — that locks the revision so the signed copy matches it exactly.`,
    )
  }
  if (input.lineCount === 0) return no('no_lines', 'Add line items before requesting signatures.')
  return SIGNABLE_ESTIMATE_STATUSES.includes(input.status) ? { eligible: true } : no('not_locked', 'This revision cannot be signed in its current state.')
}
