export type FeatureKey =
  | 'consultation'
  | 'schedule'
  | 'estimates'
  | 'walkthroughs'
  | 'issues'
  | 'warranty'
  | 'portal'
  | 'documents'
  | 'reports'
  | 'selections'
  | 'change_orders'
  | 'daily_logs'
  | 'invoices'
  | 'payments'
  | 'quickbooks'

export type FeatureGroup = 'Project workflow' | 'Homeowner experience' | 'After completion' | 'Finance'

export type FeatureDefinition = {
  key: FeatureKey
  label: string
  description: string
  defaultEnabled: boolean
  requires: FeatureKey[]
  group: FeatureGroup
  /** Only implemented modules can be switched on. Planned modules show "Coming later". */
  available: boolean
  /** Prepared but waiting on outside credentials or a connection. Shows "Setup required" instead of "Coming later". */
  setupRequired?: boolean
  setupNote?: string
  /** What turning the module off hides, shown in the confirmation. */
  disableNote?: string
  configHref?: string
  configLabel?: string
}

/** Mirrors public.feature_registry() in the database, which is the source of truth for enforcement. */
export const FEATURES: FeatureDefinition[] = [
  { key: 'schedule', label: 'Schedule', description: 'Project activities, dependencies, delays, and the company calendar.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Schedules are hidden from staff and homeowners.', configHref: '/schedule', configLabel: 'Open schedule' },
  { key: 'estimates', label: 'Estimates and budgets', description: 'Line-item estimates, revisions, and homeowner approval.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Estimates are hidden. Totals and approvals are kept exactly as they are.', configHref: '/estimates', configLabel: 'Open estimates' },
  { key: 'walkthroughs', label: 'Walkthroughs', description: 'Homeowner walkthrough checklists with photos.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Walkthroughs and their photos are hidden from staff and homeowners.' },
  { key: 'reports', label: 'Walkthrough reports', description: 'Versioned PDF reports with homeowner acknowledgment and sign-off.', defaultEnabled: true, requires: ['walkthroughs'], group: 'Project workflow', available: true, disableNote: 'Reports, PDFs, and signatures are hidden but kept.' },
  { key: 'issues', label: 'Punch list and issues', description: 'Track deficiencies through repair and homeowner validation, during construction or after.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Punch list items are hidden. Warranty claims stay visible under Warranty.' },
  { key: 'consultation', label: 'Consultations', description: 'Lead intake and consultation scheduling before a project is planned.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'selections', label: 'Selections', description: 'Finish and fixture selections with deadlines, allowances, and homeowner approvals.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'change_orders', label: 'Change orders', description: 'Scope and price changes with electronic homeowner approval.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'daily_logs', label: 'Daily logs', description: 'Site activity, weather, crews, and progress photos recorded each day.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'portal', label: 'Homeowner portal', description: 'Homeowners sign in to see their projects. They only see the modules you have turned on, and only for projects they are linked to.', defaultEnabled: true, requires: [], group: 'Homeowner experience', available: true, disableNote: 'Homeowners cannot sign in to the portal. Their accounts, project links, and past approvals are kept.', configHref: '/team', configLabel: 'Manage portal accounts' },
  { key: 'documents', label: 'Documents', description: 'Plans, permits, and contracts with per-document visibility.', defaultEnabled: false, requires: [], group: 'Homeowner experience', available: false },
  { key: 'warranty', label: 'Warranty management', description: 'Starts the 1-2-10 warranty automatically when a project is Completed, with milestone reminders, claims, and anniversary follow-ups.', defaultEnabled: true, requires: [], group: 'After completion', available: true, disableNote: 'Warranty pages, claims, and reminders pause. Coverage dates and open claims are kept and resume when you turn it back on.', configHref: '/warranty', configLabel: 'Open warranty' },
  { key: 'invoices', label: 'Invoices', description: 'Draft, issue, and track invoices and progress draws, record payments, and share invoices in the homeowner portal.', defaultEnabled: false, requires: [], group: 'Finance', available: true, disableNote: 'Invoices are hidden from staff and homeowners. Every invoice, payment, and number is kept.', configHref: '/invoices', configLabel: 'Open invoices' },
  { key: 'payments', label: 'Online payments', description: 'Collect homeowner payments online.', defaultEnabled: false, requires: ['estimates'], group: 'Finance', available: false },
  { key: 'quickbooks', label: 'QuickBooks Online', description: 'Send approved estimates to QuickBooks.', defaultEnabled: false, requires: ['estimates'], group: 'Finance', available: false, setupRequired: true, setupNote: 'Setup Required — API credentials missing. The connection and send-to-QuickBooks steps are still in development, so this switch stays locked.', configHref: '/settings/integrations', configLabel: 'Open integrations' },
]

export type FeatureMap = Record<FeatureKey, boolean>

export function resolveFeatures(overrides: Partial<Record<FeatureKey, boolean>>): FeatureMap {
  const raw = Object.fromEntries(
    FEATURES.map((f) => [f.key, f.available && (overrides[f.key] ?? f.defaultEnabled)]),
  ) as FeatureMap
  return Object.fromEntries(
    FEATURES.map((f) => [f.key, raw[f.key] && f.requires.every((r) => raw[r])]),
  ) as FeatureMap
}

export function featureLabel(key: FeatureKey) {
  return FEATURES.find((f) => f.key === key)?.label ?? key
}
