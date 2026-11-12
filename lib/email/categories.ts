/** Mirrors public.email_category_for_kind / email_category_enabled in the email migration. */
export const OPTIONAL_EMAIL_CATEGORIES = [
  {
    key: 'quote_requests',
    label: 'Quote requests',
    description: 'New quote requests, deadline changes, and quote decisions.',
    defaultEnabled: true,
  },
  {
    key: 'rfi_activity',
    label: 'RFIs',
    description: 'RFIs assigned to you, responses, and closures.',
    defaultEnabled: true,
  },
  {
    key: 'change_orders',
    label: 'Change orders',
    description: 'Change orders that need review, and approval or rejection decisions.',
    defaultEnabled: true,
  },
  {
    key: 'punch_list',
    label: 'Punch list and assigned work',
    description: 'Walkthrough items assigned to you and work awaiting verification.',
    defaultEnabled: true,
  },
  {
    key: 'invoice_reminders',
    label: 'Invoice reminders',
    description: 'A reminder three days before an invoice is due, and one notice if it becomes past due.',
    defaultEnabled: true,
  },
  {
    key: 'project_updates',
    label: 'General project updates',
    description: 'Informational updates that do not need action. Off by default.',
    defaultEnabled: false,
  },
] as const

export type OptionalEmailCategory = (typeof OPTIONAL_EMAIL_CATEGORIES)[number]['key']
export const REQUIRED_EMAIL_CATEGORIES = ['billing', 'signatures', 'account'] as const
export type RequiredEmailCategory = (typeof REQUIRED_EMAIL_CATEGORIES)[number]
export type EmailCategory = OptionalEmailCategory | RequiredEmailCategory

const OPTIONAL_KEYS = new Set<string>(OPTIONAL_EMAIL_CATEGORIES.map((c) => c.key))

export function isOptionalEmailCategory(value: string): value is OptionalEmailCategory {
  return OPTIONAL_KEYS.has(value)
}

export function isRequiredEmailCategory(value: string): value is RequiredEmailCategory {
  return (REQUIRED_EMAIL_CATEGORIES as readonly string[]).includes(value)
}

export function categoryForKind(kind: string | null | undefined): EmailCategory {
  const k = kind ?? ''
  if (k === 'subcontract_quote') return 'quote_requests'
  if (k === 'rfi') return 'rfi_activity'
  if (k === 'change_order') return 'change_orders'
  if (k === 'invoice') return 'billing'
  if (k === 'invoice_reminder') return 'invoice_reminders'
  if (k === 'signature_request') return 'signatures'
  if (k.startsWith('issue') || k === 'subcontractor_work' || k === 'punch_list') return 'punch_list'
  return 'project_updates'
}

export function categoryEnabled(category: string, saved: Partial<Record<string, boolean>>): boolean {
  if (isRequiredEmailCategory(category)) return true
  const explicit = saved[category]
  if (typeof explicit === 'boolean') return explicit
  return category !== 'project_updates'
}

export function categoryLabel(category: string): string {
  const optional = OPTIONAL_EMAIL_CATEGORIES.find((c) => c.key === category)
  if (optional) return optional.label
  if (category === 'billing') return 'Billing'
  if (category === 'signatures') return 'Signature requests'
  return 'Account'
}
