import { PRODUCT_BRAND } from './product-brand.ts'

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
  | 'time_tracking'
  | 'invoices'
  | 'payments'
  | 'quickbooks'
  | 'ai_assistant'
  | 'ai_essentials'
  | 'subcontractors'
  | 'client_updates'
  | 'rfis'
  // Display-only entries below are not in public.feature_registry(), so they can never be switched or persisted.
  | 'client_records'
  | 'additional_contacts'
  | 'communication_log'
  | 'contact_permissions'
  | 'project_photos'
  | 'ai_schedule_advisor'
  | 'ai_estimate_review'
  | 'ai_warranty_assistance'
  | 'ai_quote_analysis'
  | 'ai_voice_punch'
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
  /** One short sentence describing the purpose. */
  description: string
  defaultEnabled: boolean
  requires: FeatureKey[]
  group: FeatureGroup
  /** Only implemented modules can be switched on. Planned modules show "Planned". */
  available: boolean
  /** Essential capability that is always on and has no switch. */
  core?: boolean
  coreNote?: string
  /**
   * Implemented, but enforced by another module's company switch (for example Selections is gated by
   * Estimates in server actions and RLS). Has no switch of its own and follows that module's state.
   */
  includedWith?: FeatureKey
  /** Implemented only in part; the note explains what exists today. */
  partial?: boolean
  partialNote?: string
  /** Prepared but waiting on outside credentials or a connection. Shows "Setup required" instead of "Planned". */
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
  { key: 'client_records', label: 'Basic client management', description: 'Client records, contact details, and client-to-project links.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, configHref: '/clients', configLabel: 'Open clients' },
  { key: 'additional_contacts', label: 'Additional contacts', description: 'Multiple homeowner and authorized contacts per client.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, coreNote: 'Part of client management. It stays on so portal access and signatures are never affected.' },
  { key: 'communication_log', label: 'Communication log', description: 'Calls, meetings, site visits, and homeowner notes.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, coreNote: 'Part of client management. History is always kept.' },
  { key: 'contact_permissions', label: 'Contact permissions', description: 'Per-contact rights to view, validate, acknowledge, and sign.', defaultEnabled: true, requires: [], group: 'Clients & contacts', available: false, core: true, coreNote: 'Security control, always enforced in the database.' },

  { key: 'schedule', label: 'Schedule', description: 'Project activities, dependencies, delays, and the company calendar.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Schedules are hidden from staff and homeowners.', configHref: '/schedule', configLabel: 'Open schedule' },
  { key: 'estimates', label: 'Estimates and budgets', description: 'Line-item estimates, revisions, and homeowner approval.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Estimates and Selections are hidden. Totals, selections, and approvals are kept exactly as they are.', configHref: '/estimates', configLabel: 'Open estimates' },
  { key: 'selections', label: 'Selections', description: 'Finish and fixture selections with deadlines, allowances, and homeowner approvals.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, includedWith: 'estimates' },
  { key: 'walkthroughs', label: 'Walkthroughs', description: 'Homeowner walkthrough checklists with photos.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Walkthroughs and their photos are hidden from staff and homeowners.' },
  { key: 'reports', label: 'Walkthrough reports', description: 'Versioned PDF reports with homeowner sign-off.', defaultEnabled: true, requires: ['walkthroughs'], group: 'Project workflow', available: true, disableNote: 'Reports, PDFs, and signatures are hidden but kept.' },
  { key: 'issues', label: 'Punch list and issues', description: 'Track deficiencies through repair and homeowner validation.', defaultEnabled: true, requires: [], group: 'Project workflow', available: true, disableNote: 'Punch list items are hidden. Warranty claims stay visible under Warranty.' },
  { key: 'change_orders', label: 'Change orders', description: 'Scope, cost, and schedule changes with a recorded homeowner decision.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the change order migration to this database to unlock this switch.', disableNote: 'The Change Orders tab is hidden on every project and approved change orders stop counting toward financial dashboards. Every change order and decision record is kept.' },
  { key: 'daily_logs', label: 'Daily logs', description: 'Site activity, weather, crews, and progress photos each day.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, disableNote: 'The Daily Logs tab is hidden on every project. Every saved log and photo is kept.' },
  { key: 'time_tracking', label: 'Time tracking', description: 'Crews clock in and out by project and cost code; approved hours count as labor cost in job costing.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the time tracking migration to this database to unlock this switch.', disableNote: 'The Time page is hidden and nobody can clock in. Every time entry and approved labor cost is kept.' },
  { key: 'rfis', label: 'Questions (RFIs)', description: 'Project questions with one official answer, reviewed and closed.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the Questions (RFIs) migration to this database to unlock this switch.', disableNote: 'Questions leave Quick Create, the project More menu, and every workspace. Every question, answer, and file is kept.' },
  { key: 'subcontractors', label: 'Subcontractors', description: 'Directory of trade partners for administrators and project managers.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the subcontractor migration to this database to unlock this switch.', disableNote: 'The Subcontractors directory is hidden from project managers. Every saved company is kept.', configHref: '/subcontractors', configLabel: 'Open subcontractors' },
  { key: 'project_photos', label: 'Project photo uploads', description: 'Upload photos straight to a project library. The Photos tab always shows photos from daily logs, walkthroughs, issues, and client updates.', defaultEnabled: false, requires: [], group: 'Project workflow', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the Project Photos database migration (20270101000010_project_photos.sql) to turn this on.', disableNote: 'New uploads stop and uploaded photos are hidden from the library. Every photo and file is kept and comes back when you turn it on again. Photos from other modules are not affected.' },
  { key: 'consultation', label: 'Consultations', description: 'Lead intake and consultation scheduling before planning.', defaultEnabled: false, requires: [], group: 'Project workflow', available: false },

  { key: 'portal', label: 'Homeowner portal', description: 'Homeowners see their linked projects and the modules you turn on.', defaultEnabled: true, requires: [], group: 'Homeowner experience', available: true, disableNote: 'Homeowners cannot sign in to the portal. Their accounts, project links, and past approvals are kept.', configHref: '/team', configLabel: 'Manage portal accounts' },
  { key: 'client_updates', label: 'Client updates', description: 'Progress reports with photos, published to homeowners after review.', defaultEnabled: false, requires: ['portal'], group: 'Homeowner experience', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the client updates migration to this database to unlock this switch.', disableNote: 'Client updates are hidden from staff and homeowners. Every draft and published update is kept.' },
  { key: 'documents', label: 'Documents', description: 'Plans, permits, and contracts with versions and homeowner sharing.', defaultEnabled: false, requires: [], group: 'Homeowner experience', available: true, disableNote: 'Documents are hidden from staff and homeowners. Every file and version is kept exactly as it is.', configHref: '/documents', configLabel: 'Open documents' },
  { key: 'e_signatures', label: 'Electronic signatures', description: 'Send PDFs for signature through Dropbox Sign and keep the signed copy.', defaultEnabled: false, requires: ['documents'], group: 'Homeowner experience', available: true, setupNote: 'Add DROPBOX_SIGN_API_KEY to connect Dropbox Sign. Add DROPBOX_SIGN_CLIENT_ID to sign inside the portal.', disableNote: 'New signature requests stop. Signed PDFs, signer records, and audit history are kept and stay viewable.', configHref: '/documents', configLabel: 'Open documents' },

  { key: 'warranty', label: 'Warranty management', description: '1-2-10 warranty from completion, with claims and reminders.', defaultEnabled: true, requires: [], group: 'After completion', available: true, disableNote: 'Warranty pages, claims, and reminders pause. Coverage dates and open claims are kept and resume when you turn it back on.', configHref: '/warranty', configLabel: 'Open warranty' },

  { key: 'invoices', label: 'Invoices', description: 'Invoices and progress draws, payments received, and portal sharing.', defaultEnabled: false, requires: [], group: 'Finance', available: true, disableNote: 'Invoices are hidden from staff and homeowners. Every invoice, payment, and number is kept.', configHref: '/invoices', configLabel: 'Open invoices' },
  { key: 'payments', label: 'Online payments', description: 'Homeowners pay invoices by card or bank transfer in their portal; money goes to your own Stripe account and payments are recorded automatically. Set up in Settings → Integrations.', defaultEnabled: false, requires: ['estimates'], group: 'Finance', available: true, lockWhenSetupRequired: true, setupNote: 'Online payments need Stripe keys on the server (STRIPE_SECRET_KEY) first.', disableNote: 'Homeowners stop seeing Pay now. Payments already received stay on their invoices.' },
  { key: 'quickbooks', label: 'QuickBooks Online', description: 'Send issued invoices and recorded payments to QuickBooks Online. Connect your company in Settings → Integrations.', defaultEnabled: false, requires: ['estimates'], group: 'Finance', available: true, lockWhenSetupRequired: true, setupNote: 'QuickBooks needs Intuit API credentials (QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET) before it can be turned on.' },

  { key: 'ai_essentials', label: 'AI essentials', description: 'Daily priorities briefing, "Improve with AI" on RFIs, and drafted client updates. Every draft is reviewed before it goes anywhere.', defaultEnabled: false, requires: [], group: 'AI & automation', available: true, lockWhenSetupRequired: true, setupNote: 'No AI provider is reachable here. Vercel deployments connect to AI Gateway automatically; elsewhere add AI_GATEWAY_API_KEY.' },
  { key: 'ai_assistant', label: PRODUCT_BRAND.assistant.name, description: 'Everything in AI essentials, plus the project chat assistant, voice punch items, subcontractor quote comparison and estimate drafting. Drafts are always reviewed.', defaultEnabled: false, requires: [], group: 'AI & automation', available: true, lockWhenSetupRequired: true, setupNote: 'No AI provider is reachable here. Vercel deployments connect to AI Gateway automatically; elsewhere add AI_GATEWAY_API_KEY.' },
  { key: 'ai_estimate_review', label: 'AI estimate drafting', description: 'Drafts estimate line items in the assistant for you to review and save.', defaultEnabled: false, requires: ['estimates', 'ai_assistant'], group: 'AI & automation', available: true, includedWith: 'ai_assistant' },
  { key: 'ai_voice_punch', label: 'Voice punch list', description: 'Dictate an issue on site and review the drafted punch item before saving.', defaultEnabled: false, requires: ['ai_assistant'], group: 'AI & automation', available: true, includedWith: 'ai_assistant' },
  { key: 'ai_quote_analysis', label: 'AI quote comparison', description: 'Compares subcontractor quotes side by side and flags gaps.', defaultEnabled: false, requires: ['subcontractors', 'ai_assistant'], group: 'AI & automation', available: true, includedWith: 'ai_assistant' },
  { key: 'ai_schedule_advisor', label: 'AI schedule advisor', description: 'Identify scheduling gaps and suggest improvements.', defaultEnabled: false, requires: ['schedule', 'ai_assistant'], group: 'AI & automation', available: true, includedWith: 'ai_assistant', partial: true, partialNote: 'Today the assistant answers schedule questions and flags schedule risk in project health. A dedicated advisor is planned.' },
  { key: 'ai_warranty_assistance', label: 'AI warranty assistance', description: 'Summarize warranty records and help with claims. Decisions stay with your team.', defaultEnabled: false, requires: ['warranty', 'ai_assistant'], group: 'AI & automation', available: true, includedWith: 'ai_assistant', partial: true, partialNote: 'Today the assistant can read warranty records and answer questions. Claim drafting is planned.' },

  { key: 'project_reports', label: 'Job costing report', description: "Every job's contract, budget, cost to date and projected profit on one page.", defaultEnabled: false, requires: ['estimates'], group: 'Reporting & exports', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the job costing report migration to this database to unlock this switch.', disableNote: 'The Job costing report page is hidden. Each project keeps its own Financials tab.', configHref: '/reports/job-costing', configLabel: 'Open report' },
  { key: 'schedule_reports', label: 'Schedule report', description: "What's behind and what's coming up in the next 2 to 4 weeks across every active job. Printable for the weekly meeting.", defaultEnabled: false, requires: ['schedule'], group: 'Reporting & exports', available: true, disableNote: 'The Schedule report page is hidden. Every project schedule stays as it is.', configHref: '/reports/schedule', configLabel: 'Open report' },
  { key: 'warranty_reports', label: 'Warranty report', description: 'Claims needing action, coverage ending soon and anniversary follow-ups across every home under warranty.', defaultEnabled: false, requires: ['warranty'], group: 'Reporting & exports', available: true, disableNote: 'The Warranty report page is hidden. Warranties and claims are not affected.', configHref: '/reports/warranty', configLabel: 'Open report' },
  { key: 'data_exports', label: 'Data exports', description: 'Download clients, projects, invoices, payments, bills and time as spreadsheets (administrators only).', defaultEnabled: false, requires: [], group: 'Reporting & exports', available: true, lockWhenSetupRequired: true, setupNote: 'Apply the job costing report migration to this database to unlock this switch.', disableNote: 'The Data exports page is hidden. No records change.', configHref: '/exports', configLabel: 'Open exports' },
]

export type FeatureMap = Record<FeatureKey, boolean>

/** Only these keys have a company switch that persists to organization_features. */
export function isSwitchable(f: FeatureDefinition) {
  return f.available && !f.core && !f.includedWith
}

export function resolveFeatures(overrides: Partial<Record<FeatureKey, boolean>>): FeatureMap {
  const own = Object.fromEntries(
    FEATURES.map((f) => [f.key, Boolean(f.core) || (isSwitchable(f) && (overrides[f.key] ?? f.defaultEnabled))]),
  ) as FeatureMap
  const raw = Object.fromEntries(
    FEATURES.map((f) => [f.key, f.includedWith ? own[f.includedWith] : own[f.key]]),
  ) as FeatureMap
  return Object.fromEntries(
    FEATURES.map((f) => [f.key, raw[f.key] && f.requires.every((r) => raw[r])]),
  ) as FeatureMap
}

export function featureLabel(key: FeatureKey) {
  return FEATURES.find((f) => f.key === key)?.label ?? key
}

/** The lighter AI tier (Pro and up). The full assistant includes it. */
export function aiEssentialsEnabled(features: Partial<Record<FeatureKey, boolean>>): boolean {
  return Boolean(features.ai_essentials || features.ai_assistant)
}
