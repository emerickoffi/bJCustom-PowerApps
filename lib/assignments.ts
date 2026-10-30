import { z } from 'zod'

export type AssignmentStatus = 'active' | 'revoked'

export type ActivityAssignment = {
  id: string
  project_id: string
  schedule_activity_id: string
  subcontractor_company_id: string
  scope_of_work: string
  status: AssignmentStatus
  created_at: string
  company_name: string
  company_trade: string
  company_status: 'active' | 'inactive'
}

export type CompanyOption = {
  value: string
  label: string
  trade: string
  /** Qualification guidance; absent when vetting is unavailable or the company is fully qualified. */
  qualificationNote?: { level: 'block' | 'warn'; short: string; message: string }
}

/** Why assignments are not shown: the feature is off, the viewer cannot manage, or the migration is missing. */
export type AssignmentAvailability = 'ready' | 'off' | 'setup-required' | 'error'

export const ASSIGNMENT_SELECT =
  'id, project_id, schedule_activity_id, subcontractor_company_id, scope_of_work, status, created_at, subcontractor_companies(company_name, trade, status)'

type AssignmentRow = Omit<ActivityAssignment, 'company_name' | 'company_trade' | 'company_status'> & {
  subcontractor_companies: { company_name: string; trade: string; status: 'active' | 'inactive' } | null
}

export function toAssignment(row: AssignmentRow): ActivityAssignment {
  const { subcontractor_companies: company, ...rest } = row
  return {
    ...rest,
    company_name: company?.company_name ?? 'Unavailable company',
    company_trade: company?.trade ?? '',
    company_status: company?.status ?? 'inactive',
  }
}

const uuid = (message: string) => z.uuid({ error: message })

export const scopeOfWork = z
  .string()
  .trim()
  .min(1, 'Describe the scope of work')
  .max(2000, 'Must be 2,000 characters or fewer')

export const assignSchema = z.object({
  subcontractor_company_id: uuid('Choose a subcontractor'),
  scope_of_work: scopeOfWork,
})

export const revokeSchema = z.object({
  revoke_reason: z
    .string()
    .trim()
    .max(500, 'Must be 500 characters or fewer')
    .optional()
    .transform((v) => (v ? v : null)),
})

export function groupByActivity(assignments: ActivityAssignment[]) {
  const map = new Map<string, ActivityAssignment[]>()
  for (const a of assignments) {
    const list = map.get(a.schedule_activity_id) ?? []
    list.push(a)
    map.set(a.schedule_activity_id, list)
  }
  return map
}
