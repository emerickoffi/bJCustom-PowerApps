import { z } from 'zod'

export const SUBCONTRACTOR_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
} as const

export type SubcontractorStatus = keyof typeof SUBCONTRACTOR_STATUS_LABELS

export const SUBCONTRACTOR_STATUSES = Object.keys(SUBCONTRACTOR_STATUS_LABELS) as SubcontractorStatus[]

export type SubcontractorCompany = {
  id: string
  company_name: string
  trade: string
  email: string | null
  phone: string | null
  status: SubcontractorStatus
  created_at: string
}

export const SUBCONTRACTOR_COLUMNS = 'id, company_name, trade, email, phone, status, created_at'

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v ? v : null))

export const subcontractorSchema = z.object({
  company_name: z.string().trim().min(1, 'Enter the company name').max(160, 'Must be 160 characters or fewer'),
  trade: z.string().trim().min(1, 'Enter the trade or specialty').max(120, 'Must be 120 characters or fewer'),
  email: optional(254)
    .transform((v) => v?.toLowerCase() ?? null)
    .refine((v) => v === null || z.email().safeParse(v).success, 'Enter a valid email address'),
  phone: optional(30).refine((v) => v === null || /^[0-9+().\-\s]{7,30}$/.test(v), 'Enter a valid phone number'),
  status: z.enum(SUBCONTRACTOR_STATUSES as [SubcontractorStatus, ...SubcontractorStatus[]], {
    error: 'Choose a status',
  }),
})

/** PostgREST and Postgres codes for "this table does not exist", meaning the migration has not been applied. */
export function isMissingTableError(error: { code?: string } | null | undefined) {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}
