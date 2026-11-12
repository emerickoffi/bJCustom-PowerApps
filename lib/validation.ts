import { z } from 'zod'
import { ALL_PROJECT_STATUSES } from '@/lib/domain'
import { addBusinessDays, parseBusinessDays } from '@/lib/business-days'
import { INVALID_STATE_MESSAGE, isUsCountry, normalizeUsState, optionalUsState, requiredUsState } from './us-states.ts'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null)

const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v.toLowerCase()))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || z.email().safeParse(v).success, 'Enter a valid email address')

const optionalPhone = optionalText(30).refine(
  (v) => v === null || /^[0-9+().\-\s]{7,30}$/.test(v),
  'Enter a valid phone number',
)

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Enter a valid date')

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Use a 6-digit hex color such as #174D32')

export const organizationOnboardingSchema = z.object({
  display_name: z.string().trim().min(2, 'Company name is required').max(120),
  legal_name: optionalText(160),
  phone: optionalPhone,
  email: optionalEmail,
  city: optionalText(80),
  state: optionalUsState,
  project_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, 'Use 1-6 letters or numbers'),
})

export const organizationSettingsSchema = z.object({
  display_name: z.string().trim().min(2, 'Company name is required').max(120),
  legal_name: optionalText(160),
  logo_url: optionalText(500).refine(
    (v) => v === null || v.startsWith('/') || /^https:\/\//.test(v),
    'Use an https:// URL or a path such as /branding/logo.png',
  ),
  primary_color: hexColor,
  secondary_color: hexColor,
  address_line1: optionalText(160),
  address_line2: optionalText(160),
  city: optionalText(80),
  state: optionalUsState,
  postal_code: optionalText(20),
  phone: optionalPhone,
  email: optionalEmail,
  website: optionalText(200),
  project_number_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,6}$/, 'Use 1-6 letters or numbers'),
})

export const clientSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(80),
  middle_name: optionalText(80),
  last_name: z.string().trim().min(1, 'Last name is required').max(80),
  company_name: optionalText(160),
  email: optionalEmail,
  phone: optionalPhone,
  alternate_phone: optionalPhone,
  address_line1: optionalText(160),
  address_line2: optionalText(160),
  city: optionalText(80),
  state: optionalText(40),
  postal_code: optionalText(20),
  country: z.string().trim().min(2).max(80).default('United States'),
  preferred_communication: z.enum(['email', 'phone', 'text', 'any']),
  status: z.enum(['lead', 'active', 'inactive', 'archived']),
  notes: optionalText(4000),
}).transform((data, ctx) => {
  // U.S. addresses store the two-letter code; other countries keep their own state/province/region text.
  if (!data.state || !isUsCountry(data.country)) return data
  const code = normalizeUsState(data.state)
  if (!code) {
    ctx.addIssue({ code: 'custom', path: ['state'], message: INVALID_STATE_MESSAGE })
    return z.NEVER
  }
  return { ...data, state: code }
})

const checkbox = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())

export const contactSchema = z
  .object({
    first_name: z.string().trim().min(1, 'First name is required').max(80),
    middle_name: optionalText(80),
    last_name: z.string().trim().min(1, 'Last name is required').max(80),
    relationship: z.enum([
      'primary_owner',
      'spouse',
      'partner',
      'co_owner',
      'trustee',
      'authorized_representative',
      'family',
      'agent',
      'attorney',
      'property_manager',
      'other',
    ]),
    email: optionalEmail,
    phone: optionalPhone,
    alternate_phone: optionalPhone,
    preferred_communication: z.enum(['email', 'phone', 'text', 'any']).default('email'),
    portal_enabled: checkbox,
    portal_view_reports: checkbox,
    portal_validate_issues: checkbox,
    portal_acknowledge: checkbox,
    portal_sign: checkbox,
  })
  .refine((c) => !c.portal_enabled || Boolean(c.email), {
    path: ['email'],
    message: 'An email address is required for portal access',
  })

export const activitySchema = z.object({
  activity_type: z.enum(['note', 'call', 'email', 'meeting', 'site_visit']),
  summary: z.string().trim().min(1, 'Summary is required').max(500),
  details: optionalText(4000),
})

export const projectSchema = z
  .object({
    name: z.string().trim().min(2, 'Project name is required').max(160),
    // Empty means "Assign later": the project is saved with no primary homeowner.
  primary_client_id: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null),
    z.uuid('Choose a client from the list or select Assign later').nullable(),
  ),
    project_type: z.enum(['new_custom_home', 'renovation', 'addition', 'remodel', 'other']),
    description: optionalText(4000),
    address_line1: z.string().trim().min(1, 'Street address is required').max(160),
    address_line2: optionalText(160),
    city: z.string().trim().min(1, 'City is required').max(80),
    state: requiredUsState,
    postal_code: z.string().trim().min(3, 'ZIP code is required').max(20),
    lot: optionalText(40),
    block: optionalText(40),
    phase: optionalText(40),
    community: optionalText(120),
    legal_description: optionalText(1000),
    estimated_budget: z
      .string()
      .trim()
      .transform((v) => v.replace(/[$,\s]/g, ''))
      .refine((v) => !v.startsWith('-'), 'Budget cannot be negative')
      .refine(
        (v) => v === '' || v.startsWith('-') || (/^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 100_000_000),
        'Enter an amount up to $100,000,000 with at most 2 decimals',
      )
      .transform((v) => (v === '' ? null : Math.round(Number(v) * 100))),
    proposed_start_date: optionalDate,
    target_completion_date: optionalDate,
    project_manager_id: z
      .string()
      .trim()
      .transform((v) => (v === '' || v === 'none' ? null : v))
      .refine((v) => v === null || z.uuid().safeParse(v).success, 'Select a project manager'),
    internal_notes: optionalText(4000),
    planned_business_days: z
      .string()
      .optional()
      .default('')
      .superRefine((v, ctx) => {
        const { error } = parseBusinessDays(v)
        if (error) ctx.addIssue({ code: 'custom', message: error })
      })
      .transform((v) => parseBusinessDays(v).value),
  })
  // The server recalculates so a stale or tampered completion date can never disagree with the duration.
  .transform((v) => {
    if (!v.proposed_start_date || v.planned_business_days === null) return v
    const target = addBusinessDays(v.proposed_start_date, v.planned_business_days)
    return target ? { ...v, target_completion_date: target } : v
  })
  .refine(
    (v) => !v.proposed_start_date || !v.target_completion_date || v.target_completion_date >= v.proposed_start_date,
    { message: 'Completion date must be on or after the start date', path: ['target_completion_date'] },
  )

export const statusChangeSchema = z.object({
  project_id: z.uuid(),
  status: z.enum(ALL_PROJECT_STATUSES as [string, ...string[]]),
  note: optionalText(500),
})

export const staffInviteSchema = z.object({
  email: z.email('Enter a valid email address').trim().toLowerCase(),
  role: z.enum(['org_admin', 'project_manager', 'builder_staff']),
})

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(120),
  phone: optionalPhone,
})
