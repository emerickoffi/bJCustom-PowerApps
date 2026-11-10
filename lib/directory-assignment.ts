import { z } from 'zod'
import { PROJECT_ROLE_OPTIONS } from './contacts.ts'

/** Upper bound for one submission so a single request stays well within action and database limits. */
export const MAX_BULK_ASSIGN = 200

/**
 * The only project-access option for directory contacts. No permission presets exist for business contacts, so access is
 * stated explicitly instead of being implied by the assignment. Portal logins are managed separately via Manage access.
 */
export const NO_PORTAL_ACCESS = 'no_portal_access' as const
export const PROJECT_ACCESS_LABEL: Record<typeof NO_PORTAL_ACCESS, string> = { no_portal_access: 'No portal access' }

export type RecordKind = 'person' | 'company'
export const itemKey = (kind: RecordKind, id: string) => `${kind}:${id}`

export type EmailDelivery = { available: true } | { available: false; reason: string }

/** No email provider is wired into this app yet. Kept as a value so the UI and server report the same reason. */
export const EMAIL_DELIVERY: EmailDelivery = {
  available: false,
  reason: 'Email delivery is not configured for this workspace, so no notifications can be sent.',
}

export type EmailEligibility = { eligible: true } | { eligible: false; reason: string }

const emailShape = z.email()

export function emailEligibility(email: string | null | undefined, delivery: EmailDelivery): EmailEligibility {
  const value = email?.trim() ?? ''
  if (!value) return { eligible: false, reason: 'No email address on file.' }
  if (!emailShape.safeParse(value).success) return { eligible: false, reason: 'The email address on file is not valid.' }
  if (!delivery.available) return { eligible: false, reason: delivery.reason }
  return { eligible: true }
}

/**
 * Company job titles that say nothing about project responsibility: an "Owner" of a plumbing company is not this
 * project's owner, and a "Foreman" title doesn't say which work they're responsible for. These never pre-fill a role.
 */
const AMBIGUOUS_POSITIONS = new Set(['owner', 'foreman', 'supervisor', 'owner/company representative', 'office contact', 'billing contact', 'other'])

/** Suggests a project role only when a company position maps to one unambiguously; returns '' so the user must choose otherwise. */
export function suggestProjectRole(position: string | null | undefined): string {
  const p = position?.trim().toLowerCase() ?? ''
  if (!p || AMBIGUOUS_POSITIONS.has(p)) return ''
  const exact = PROJECT_ROLE_OPTIONS.find((r) => r.toLowerCase() === p)
  if (exact) return exact
  if (p === 'sales representative' || p === 'account manager') return 'Supplier Representative'
  return ''
}

const personItem = z.object({
  kind: z.literal('person'),
  id: z.uuid(),
  person_company_id: z.uuid().nullable(),
  project_role: z.string().trim().min(1, 'Project role is required').max(120, 'Project role must be 120 characters or fewer'),
  access: z.literal(NO_PORTAL_ACCESS, 'Choose project access'),
  notify: z.boolean(),
  /** YYYY-MM-DD. Omitted means the association starts today; the action validates the date itself. */
  started_at: z.string().trim().max(10, 'Enter a valid start date').optional(),
})

const companyItem = z.object({ kind: z.literal('company'), id: z.uuid() })

export const bulkAssignSchema = z
  .array(z.discriminatedUnion('kind', [personItem, companyItem]))
  .min(1, 'Select at least one record.')
  .max(MAX_BULK_ASSIGN, `Select ${MAX_BULK_ASSIGN} records or fewer at a time.`)
  .superRefine((items, ctx) => {
    const seen = new Set<string>()
    for (const item of items) {
      const key = itemKey(item.kind, item.id)
      if (seen.has(key)) ctx.addIssue({ code: 'custom', message: 'A record was selected more than once.' })
      seen.add(key)
    }
  })

export type BulkAssignItem = z.infer<typeof bulkAssignSchema>[number]
export type PersonAssignItem = Extract<BulkAssignItem, { kind: 'person' }>

export type AssignOutcome = 'added' | 'already_assigned' | 'failed'
export type NotificationOutcome = 'not_requested' | 'sent' | 'not_sent'

export type BulkAssignResult = {
  key: string
  kind: RecordKind
  id: string
  name: string
  outcome: AssignOutcome
  reason?: string
  notification: NotificationOutcome
  notificationReason?: string
}

/** Maps an insert error to an outcome. Unique violations mean an active assignment already exists, which makes retries safe. */
export function classifyInsertError(error: { code?: string; message?: string } | null | undefined): { outcome: AssignOutcome; reason?: string } {
  if (!error) return { outcome: 'added' }
  if (error.code === '23505') return { outcome: 'already_assigned', reason: 'Already assigned to this project.' }
  // Trigger messages (P0001) are written for people and contain no internal detail.
  if (error.code === 'P0001' && error.message) return { outcome: 'failed', reason: `${error.message}.` }
  if (error.code === '42501') return { outcome: 'failed', reason: 'You are not allowed to make this assignment.' }
  if (error.code === 'PGRST205' || error.code === '42P01') return { outcome: 'failed', reason: 'Assignment storage is not set up in this environment.' }
  return { outcome: 'failed', reason: 'This assignment could not be saved. Please try again.' }
}

/** Notifications only follow a membership created by this request, so retries never re-notify existing assignments. */
export function resolveNotification(
  requested: boolean,
  outcome: AssignOutcome,
  eligibility: EmailEligibility,
): { notification: NotificationOutcome; notificationReason?: string } {
  if (!requested) return { notification: 'not_requested' }
  if (outcome !== 'added') return { notification: 'not_sent', notificationReason: 'Not sent because no new assignment was made.' }
  if (!eligibility.eligible) return { notification: 'not_sent', notificationReason: eligibility.reason }
  return { notification: 'sent' }
}

export function summarizeResults(results: readonly BulkAssignResult[]) {
  const count = (fn: (r: BulkAssignResult) => boolean) => results.filter(fn).length
  return {
    added: count((r) => r.outcome === 'added'),
    alreadyAssigned: count((r) => r.outcome === 'already_assigned'),
    failed: count((r) => r.outcome === 'failed'),
    notificationsSent: count((r) => r.notification === 'sent'),
    notificationsNotSent: count((r) => r.notification === 'not_sent'),
  }
}

/** Returns only the submitted items whose result failed, preserving their reviewed settings for a retry. */
export function failedItems<T extends { kind: RecordKind; id: string }>(submitted: readonly T[], results: readonly BulkAssignResult[]): T[] {
  const failed = new Set(results.filter((r) => r.outcome === 'failed').map((r) => r.key))
  return submitted.filter((i) => failed.has(itemKey(i.kind, i.id)))
}

/** Merges a retry's results into the previous run so earlier successes stay visible. */
export function mergeResults(previous: readonly BulkAssignResult[], retry: readonly BulkAssignResult[]): BulkAssignResult[] {
  const byKey = new Map(retry.map((r) => [r.key, r]))
  return previous.map((r) => byKey.get(r.key) ?? r)
}
