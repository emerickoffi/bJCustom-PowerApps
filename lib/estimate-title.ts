import { z } from 'zod'
import { isEditableStatus, type EstimateStatus } from './estimates.ts'

/** Shared with the full estimate editor so grid and form validate titles identically. */
export const estimateNameSchema = z.string().trim().min(2, 'Enter an estimate name').max(160)

/** Strict: any field other than these (total, status, project_id, …) rejects the whole request. */
export const titleEditRequestSchema = z.strictObject({
  estimateId: z.uuid(),
  organizationId: z.uuid(),
  expectedUpdatedAt: z.string().min(1).max(64),
  name: estimateNameSchema,
})

export type TitleEditRequest = z.infer<typeof titleEditRequestSchema>

export type TitleEditResult =
  | { ok: true; name: string; updatedAt: string; unchanged?: boolean }
  | {
      ok: false
      code: 'invalid' | 'forbidden' | 'workspace' | 'not_found' | 'locked' | 'conflict' | 'error'
      message: string
      current?: { name: string; updatedAt: string }
    }

export type TitleEligibility = { editable: true } | { editable: false; reason: string }

export function titleEditEligibility(input: {
  canManage: boolean
  status: EstimateStatus
  isLatest: boolean
}): TitleEligibility {
  if (!input.canManage) return { editable: false, reason: 'Only admins and project managers can edit estimates.' }
  if (!input.isLatest) return { editable: false, reason: 'A newer revision exists. Edit the latest revision.' }
  if (!isEditableStatus(input.status)) {
    const label = input.status === 'submitted' ? 'submitted to the client' : input.status
    return { editable: false, reason: `Locked because it was ${label}. Create a revision to make changes.` }
  }
  return { editable: true }
}

/** Maps a strict-schema failure to a single user-facing message. */
export function describeTitleRequestError(error: z.ZodError): { message: string; field: boolean } {
  const unknownKeys = error.issues.find((i) => i.code === 'unrecognized_keys')
  if (unknownKeys) return { message: 'Only the estimate title can be changed here.', field: false }
  const nameIssue = error.issues.find((i) => i.path[0] === 'name')
  if (nameIssue) return { message: nameIssue.message, field: true }
  return { message: 'Invalid request.', field: false }
}
