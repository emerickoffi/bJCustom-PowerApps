import type { ZodError } from 'zod'

export type ActionState = {
  error?: string
  fieldErrors?: Record<string, string>
  success?: string
  values?: Record<string, string>
  /** Set by overlay-mode actions that return instead of redirecting, so the modal or drawer can close. */
  savedId?: string
  /** Partial success: the main record saved but something related did not. */
  warning?: string
  /** An existing record that blocked creation, so the form can offer to open it instead of making a duplicate. */
  duplicate?: { id: string; name: string; href: string; kind: 'company' | 'subcontractor'; inactive?: boolean }
  /** Interruption-safe saves return the destination instead of redirecting, so the client can confirm first. */
  redirectTo?: string
  /** Someone else changed the record since it was loaded; nothing was written. */
  conflict?: boolean
  /** The session expired or belongs to another user; nothing was written. */
  authRequired?: boolean
}

/** Hidden field that asks a form action to return its result instead of redirecting. */
export const OVERLAY_FIELD = '_overlay'

export const initialActionState: ActionState = {}

export function fromZodError(error: ZodError): ActionState {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return { error: 'Please correct the highlighted fields.', fieldErrors }
}

/** Maps database errors to safe, human-readable messages. */
export function friendlyDbError(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Something went wrong. Please try again.'
  if (error.code === '42501') return 'You do not have permission to perform this action.'
  if (error.code === '23505') return 'A record with these details already exists.'
  if (error.code === 'P0001' && error.message) return error.message
  // Raised by runTrackedSave itself (not Postgres); its message is written for end users.
  if (error.code === 'SAVE_LEDGER_MISSING' && error.message) return error.message
  return 'Something went wrong. Please try again.'
}

export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value
  }
  return values
}
