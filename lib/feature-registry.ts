export type FeatureKey =
  | 'consultation'
  | 'schedule'
  | 'estimates'
  | 'walkthroughs'
  | 'issues'
  | 'warranty'
  | 'portal'
  | 'documents'
  | 'e_signatures'
  | 'reports'
  | 'selections'
  | 'change_orders'
  | 'daily_logs'
  | 'invoices'
  | 'payments'
  | 'quickbooks'
  | 'ai_assistant'
  | 'subcontractors'
  | 'client_updates'
  // Display-only entries below are not in public.feature_registry(), so they can never be switched or persisted.
  | 'client_records'
  | 'additional_contacts'
  | 'communication_log'
  | 'contact_permissions'
  | 'project_photos'
  | 'ai_schedule_advisor'
  | 'ai_estimate_review'
  | 'ai_warranty_assistance'
  | 'project_reports'
  | 'schedule_reports'
  | 'warranty_reports'
  | 'data_exports'

export type FeatureGroup =
  | 'Clients & contacts'
  | 'Project workflow'
  | 'Homeowner experience'
  | 'After completion'
  | 'Finance'
  | 'AI & automation'
  | 'Reporting & exports'

export type FeatureDefinition = {
  key: FeatureKey
  label: string
  description: string
  defaultEnabled: boolean
  requires: FeatureKey[]
  group: FeatureGroup
  /** Only implemented modules can be switched on. Planned modules show "Coming later". */
  available: boolean
  /** Essential capability that is always on and has no switch. */
  core?: boolean
  coreNote?: string
  /** Prepared but waiting on outside credentials or a connection. Shows "Setup required" instead of "Coming later". */
  setupRequired?: boolean
  setupNote?: string
  /** When runtime setup is missing, the switch cannot be turned on (it can still be turned off). */
  lockWhenSetupRequired?: boolean
  /** What turning the module off hides, shown in the confirmation. */
  disableNote?: string
  configHref?: string
  configLabel?: string
}

/** Switchable entries mirror public.feature_registry() in the database, which is the source of truth for enforcement. */
export const FEATURES: FeatureDefinition[] = [
  { key: 'client_records', label: 'Basic client management', description: 'Client records, primary contact details, client-to-project links, and essential client data.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, configHref: '/clients', configLabel: 'Open clients' },
  { key: 'additional_contacts', label: 'Additional contacts', description: 'Allow multiple homeowner and authorized contacts on each client account.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, coreNote: 'Included with client management today. A separate switch needs database enforcement first, so that turning it off could never affect portal accounts, signatures, or project access.' },
  { key: 'communication_log', label: 'Communication log', description: 'Track calls, meetings, site visits, notes, and homeowner communications.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, coreNote: 'Included with client management today. A separate switch is planned. History is always kept, and security audit logs are never affected.' },
  { key: 'contact_permissions', label: 'Contact permissions', description: 'Per-contact rights to view reports, validate repairs, acknowledge reports, and sign documents.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, coreNote: 'Security control. These rights are always enforced in the database and cannot be switched off.' },

  { key: 'schedule', label: 'Schedule', description: 'Project activities, dependencies, delays, and the company calendar.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Schedules are hidden from staff and homeowners.', configHref: '/schedule', configLabel: 'Open schedule' },
  { key: 'estimates', label: 'Estimates and budgets', description: 'Line-item estimates, revisions, and homeowner approval.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Estimates are hidden. Totals and approvals are kept exactly as they are.', configHref: '/estimates', configLabel: 'Open estimates' },
  { key: 'walkthroughs', label: 'Walkthroughs', description: 'Homeowner walkthrough checklists with photos.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Walkthroughs and their photos are hidden from staff and homeowners.' },
  { key: 'reports', label: 'Walkthrough reports', description: 'Versioned PDF reports with homeowner acknowledgment and sign-off.', defaultEnabled: true, requires: ['walkthroughs'], group: 'Project workflow', available: true, disableNote: 'Reports, PDFs, and signatures are hidden but kept.' },
  { key: 'issues', label: 'Punch list and issues', description: 'Track deficiencies through repair and homeowner validation, during construction or after.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Punch list items are hidden. Warranty claims stay visible under Warranty.' },
  { key: 'subcontractors', label: 'Subcontractors', description: 'A company directory of trade partners with their trade, contact details, and status. Visible only to administrators and project managers.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, lockWhenSetupRequired: true, setupNote: 'The subcontractor database migration has not been applied in this environment, so this switch stays locked until it is.', disableNote: 'The Subcontractors directory is hidden from project managers. Every saved company is kept.', configHref: '/subcontractors', configLabel: 'Open subcontractors' },
  { key: 'project_photos', label: 'Project photos', description: 'Manage project photographs and visual construction progress.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'consultation', label: 'Consultations', description: 'Lead intake and consultation scheduling before a project is planned.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'selections', label: 'Selections', description: 'Finish and fixture selections with deadlines, allowances, and homeowner approvals.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'change_orders', label: 'Change orders', description: 'Scope and price changes with electronic homeowner approval.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },
  { key: 'daily_logs', label: 'Daily logs', description: 'Site activity, weather, crews, and progress photos recorded each day.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },

  { key: 'client_updates', label: 'Client updates', description: 'Builder-written progress reports with selected photos, reviewed and published to homeowners in the portal. Nothing is shared until a manager publishes it, and publishing never sends email or text messages.', defaultEnabled: false, requires: ['portal'], group: 'Homeowner experience', available: true, lockWhenSetupRequired: true, setupNote: 'The client updates database migration has not been applied in this environment, so this switch stays locked until it is.', disableNote: 'Client updates are hidden from staff and homeowners. Every draft and published update is kept.' },
  { key: 'portal', label: 'Homeowner portal', description: 'Homeowners sign in to see their projects. They only see the modules you have turned on, and only for projects they are linked to.', defaultEnabled: true, requires: [], group: 'Homeowner experience', available: true, disableNote: 'Homeowners cannot sign in to the portal. Their accounts, project links, and past approvals are kept.', configHref: '/team', configLabel: 'Manage portal accounts' },
  { key: 'documents', label: 'Documents', description: 'Project plans, permits, contracts, and reports with version history and per-document homeowner sharing.', defaultEnabled: false, requires: [], group: 'Homeowner experience', available: true, disableNote: 'Documents are hidden from staff and homeowners. Every file and version is kept exactly as it is.', configHref: '/documents', configLabel: 'Open documents' },
  { key: 'e_signatures', label: 'Electronic signatures', description: 'Send PDF documents for legally binding electronic signature through Dropbox Sign, track progress, and keep the signed copy and audit trail with the project.', defaultEnabled: false, requires: ['documents'], group: 'Homeowner experience', available: true, setupNote: 'Add DROPBOX_SIGN_API_KEY to the project environment to connect Dropbox Sign. Add DROPBOX_SIGN_CLIENT_ID as well to let homeowners sign inside the portal.', disableNote: 'New signature requests stop. Signed PDFs, signer records, and audit history are kept and stay viewable.', configHref: '/documents', configLabel: 'Open documents' },

  { key: 'warranty', label: 'Warranty management', description: 'Starts the 1-2-10 warranty automatically when a project is Completed, with milestone reminders, claims, and anniversary follow-ups.', defaultEnabled: true, requires: [], group: 'After completion', available: true, disableNote: 'Warranty pages, claims, and reminders pause. Coverage dates and open claims are kept and resume when you turn it back on.', configHref: '/warranty', configLabel: 'Open warranty' },

  { key: 'invoices', label: 'Invoices', description: 'Draft, issue, and track invoices and progress draws, record payments, and share invoices in the homeowner portal.', defaultEnabled: false, requires: [], group: 'Finance', available: true, disableNote: 'Invoices are hidden from staff and homeowners. Every invoice, payment, and number is kept.', configHref: '/invoices', configLabel: 'Open invoices' },
  { key: 'payments', label: 'Online payments', description: 'Collect homeowner payments online.', defaultEnabled: false, requires: ['estimates'], group: 'Finance', available: false },
  { key: 'quickbooks', label: 'QuickBooks Online', description: 'Send approved estimates to QuickBooks.', defaultEnabled: false, requires: ['estimates'], group: 'Finance', available: false, setupRequired: true, setupNote: 'API credentials are missing, and the connection and send-to-QuickBooks steps are still in development, so this switch stays locked.', configHref: '/settings/integrations', configLabel: 'Open integrations' },

  { key: 'ai_assistant', label: 'B & J AI Assistant', description: 'Ask questions about projects and receive AI-assisted construction management guidance. Drafts are always reviewed before anything is sent.', defaultEnabled: false, requires: [], group: 'AI & automation', available: true, lockWhenSetupRequired: true, setupNote: 'No AI provider is reachable in this environment. Deployments on Vercel connect to AI Gateway automatically; elsewhere add AI_GATEWAY_API_KEY. The switch unlocks once the provider is available.' },
  { key: 'ai_schedule_advisor', label: 'AI schedule advisor', description: 'Identify scheduling gaps and suggest improvements to construction activities.', defaultEnabled: false, requires: ['schedule', 'ai_assistant'], group: 'AI & automation', available: false },
  { key: 'ai_estimate_review', label: 'AI estimate review', description: 'Review estimate information and suggest improvements. Approved estimate values are never changed automatically.', defaultEnabled: false, requires: ['estimates', 'ai_assistant'], group: 'AI & automation', available: false },
  { key: 'ai_warranty_assistance', label: 'AI warranty assistance', description: 'Summarize warranty records and assist with claims and follow-ups. Coverage decisions always stay with your team.', defaultEnabled: false, requires: ['warranty', 'ai_assistant'], group: 'AI & automation', available: false },

  { key: 'project_reports', label: 'Advanced project reports', description: 'Cross-project summaries of progress, budgets, and open items.', defaultEnabled: false, requires: [], group: 'Reporting & exports', available: false },
  { key: 'schedule_reports', label: 'Schedule reports', description: 'Printable schedule summaries, delays, and lookahead reports.', defaultEnabled: false, requires: ['schedule'], group: 'Reporting & exports', available: false },
  { key: 'warranty_reports', label: 'Warranty reports', description: 'Coverage, claim, and follow-up reports across completed homes.', defaultEnabled: false, requires: ['warranty'], group: 'Reporting & exports', available: false },
  { key: 'data_exports', label: 'Data exports', description: 'Export company records to spreadsheets for backup and analysis.', defaultEnabled: false, requires: [], group: 'Reporting & exports', available: false },
]

export type FeatureMap = Record<FeatureKey, boolean>

export function resolveFeatures(overrides: Partial<Record<FeatureKey, boolean>>): FeatureMap {
  const raw = Object.fromEntries(
    FEATURES.map((f) => [f.key, Boolean(f.core) || (f.available && (overrides[f.key] ?? f.defaultEnabled))]),
  ) as FeatureMap
  return Object.fromEntries(
    FEATURES.map((f) => [f.key, raw[f.key] && f.requires.every((r) => raw[r])]),
  ) as FeatureMap
}

export function featureLabel(key: FeatureKey) {
  return FEATURES.find((f) => f.key === key)?.label ?? key
}
