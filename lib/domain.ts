export type OrgRole = 'org_admin' | 'project_manager' | 'builder_staff' | 'client'
export type ClientStatus = 'lead' | 'active' | 'inactive' | 'archived'
export type CommunicationMethod = 'email' | 'phone' | 'text' | 'any'
export type ProjectStatus =
  | 'lead'
  | 'consultation'
  | 'planning'
  | 'estimating'
  | 'awaiting_approval'
  | 'preconstruction'
  | 'under_construction'
  | 'final_inspection'
  | 'punch_list'
  | 'substantially_complete'
  | 'completed'
  | 'on_hold'
  | 'cancelled'

export const ROLE_LABELS: Record<OrgRole, string> = {
  org_admin: 'Administrator',
  project_manager: 'Project Manager',
  builder_staff: 'Builder Staff',
  client: 'Homeowner',
}

export const STAFF_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff']

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  lead: 'Lead',
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
}

export const COMMUNICATION_LABELS: Record<CommunicationMethod, string> = {
  email: 'Email',
  phone: 'Phone call',
  text: 'Text message',
  any: 'No preference',
}

export const PROJECT_PIPELINE: ProjectStatus[] = [
  'lead',
  'consultation',
  'planning',
  'estimating',
  'awaiting_approval',
  'preconstruction',
  'under_construction',
  'final_inspection',
  'punch_list',
  'substantially_complete',
  'completed',
]

export const ALL_PROJECT_STATUSES: ProjectStatus[] = [...PROJECT_PIPELINE, 'on_hold', 'cancelled']

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  lead: 'Lead',
  consultation: 'Consultation',
  planning: 'Planning',
  estimating: 'Estimating',
  awaiting_approval: 'Awaiting Approval',
  preconstruction: 'Preconstruction',
  under_construction: 'Under Construction',
  final_inspection: 'Final Inspection',
  punch_list: 'Punch List',
  substantially_complete: 'Substantially Complete',
  completed: 'Completed',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
}

export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  'preconstruction',
  'under_construction',
  'final_inspection',
  'punch_list',
  'substantially_complete',
]

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  new_custom_home: 'New Custom Home',
  renovation: 'Renovation',
  addition: 'Addition',
  remodel: 'Remodel',
  other: 'Other',
}

export const CONTACT_RELATIONSHIP_LABELS: Record<string, string> = {
  primary_owner: 'Primary owner',
  spouse: 'Spouse',
  partner: 'Partner',
  co_owner: 'Co-owner',
  trustee: 'Trustee',
  authorized_representative: 'Authorized representative',
  family: 'Family member',
  agent: 'Real estate agent',
  attorney: 'Attorney',
  property_manager: 'Property manager',
  other: 'Other',
}

export const CONTACT_PORTAL_PERMISSIONS = [
  { key: 'portal_view_reports', label: 'View reports' },
  { key: 'portal_validate_issues', label: 'Validate repairs' },
  { key: 'portal_acknowledge', label: 'Acknowledge reports' },
  { key: 'portal_sign', label: 'Sign documents' },
] as const

export const PROJECT_CLIENT_RELATIONSHIP_LABELS: Record<string, string> = {
  primary_owner: 'Primary owner',
  co_owner: 'Co-owner',
  authorized_contact: 'Authorized contact',
}

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Phone call',
  email: 'Email',
  meeting: 'Meeting',
  site_visit: 'Site visit',
  system: 'System',
}

/** Mirrors public.project_status_transition_allowed in the database. */
export function isStatusTransitionAllowed(from: ProjectStatus, to: ProjectStatus): boolean {
  if (from === to) return true
  if (from === 'completed') return false
  if (from === 'cancelled') return to === 'lead'
  if (to === 'on_hold' || to === 'cancelled') return true
  const toIndex = PROJECT_PIPELINE.indexOf(to)
  if (from === 'on_hold') return toIndex >= 0
  const fromIndex = PROJECT_PIPELINE.indexOf(from)
  return toIndex > fromIndex || toIndex === fromIndex - 1
}

export function allowedNextStatuses(from: ProjectStatus): ProjectStatus[] {
  return ALL_PROJECT_STATUSES.filter((s) => s !== from && isStatusTransitionAllowed(from, s))
}
