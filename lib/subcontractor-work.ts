export const SUB_WORK_BUCKET = 'subcontractor-work'

export type SubmissionKind = 'work' | 'correction'
export type SubmissionStatus = 'draft' | 'submitted' | 'accepted' | 'correction_required' | 'returned'
export type ReviewDecision = 'accepted' | 'correction_required' | 'returned'

/** The four conceptual states the business tracks, derived from the latest submission cycle. */
export type WorkState = 'in_progress' | 'submitted' | 'correction_required' | 'accepted'

export function workStateFor(latest: SubmissionStatus | string | null | undefined): WorkState {
  if (latest === 'submitted') return 'submitted'
  if (latest === 'accepted') return 'accepted'
  if (latest === 'correction_required' || latest === 'returned') return 'correction_required'
  return 'in_progress'
}

export const WORK_STATE_LABELS: Record<WorkState, string> = {
  in_progress: 'Work in progress',
  submitted: 'Submitted for inspection',
  correction_required: 'Correction required',
  accepted: 'Satisfactorily completed',
}

/** Builder-facing wording for the same states. */
export const BUILDER_STATE_LABELS: Record<WorkState, string> = {
  in_progress: 'Work in progress',
  submitted: 'Awaiting builder verification',
  correction_required: 'Correction required',
  accepted: 'Satisfactorily completed',
}

export const DECISION_LABELS: Record<ReviewDecision, string> = {
  accepted: 'Satisfactorily completed',
  correction_required: 'Correction required',
  returned: 'Returned as incomplete',
}

export function subEvidencePath(organizationId: string, submissionId: string, fileName: string) {
  return `${organizationId}/${submissionId}/${fileName}`
}

export function isSubWorkSetupError(error: { code?: string } | null | undefined) {
  const code = error?.code
  return code === 'PGRST205' || code === '42P01' || code === '42703' || code === 'PGRST202' || code === '42883'
}

export function isOverdue(dueDate: string | null | undefined, today: string, state: WorkState) {
  return Boolean(dueDate) && state !== 'accepted' && (dueDate as string) < today
}
