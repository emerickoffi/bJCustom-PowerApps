import type { OrgRole } from '@/lib/domain'

export type QuickActionIcon =
  | 'schedule'
  | 'estimate'
  | 'document'
  | 'project'
  | 'client'
  | 'contact'
  | 'subcontractor'
  | 'invoice'
  | 'daily_log'
  | 'rfi'

/**
 * Actions with `drawer` open an in-place drawer from the menu; `href` stays the full-page fallback.
 * `projectId` is set on job actions whose drawer inherits the project instead of asking for one.
 */
export type QuickAction = {
  key: string
  label: string
  href: string
  icon: QuickActionIcon
  drawer?: 'contact' | 'rfi'
  projectId?: string
}

type QuickActionFeatures = Partial<
  Record<'schedule' | 'estimates' | 'documents' | 'daily_logs' | 'invoices' | 'subcontractors' | 'rfis', boolean>
>

const isManager = (role: OrgRole | null) => role === 'org_admin' || role === 'project_manager'
const DAILY_LOG_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff']
const STAFF_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff']
export const ASK_QUESTION_LABEL = 'Ask a question (RFI)'

/**
 * Actions for one job. Each mirrors the guard on its destination page (role, feature switch, project state),
 * and every destination re-checks access server-side before anything is saved.
 */
export function buildProjectQuickActions(input: {
  projectId: string
  status: string
  archived: boolean
  role: OrgRole | null
  features: QuickActionFeatures
  canViewInternal: boolean
}): QuickAction[] {
  const { projectId, status, archived, role, features, canViewInternal } = input
  if (archived) return []
  const manager = isManager(role)
  const id = encodeURIComponent(projectId)
  const base = `/projects/${id}`
  const actions: QuickAction[] = []
  if (manager && features.schedule) {
    actions.push({ key: 'schedule', label: 'Add schedule activity', href: `${base}/schedule?new=activity`, icon: 'schedule' })
  }
  if (features.daily_logs && canViewInternal && role && DAILY_LOG_ROLES.includes(role) && status !== 'cancelled') {
    actions.push({ key: 'daily_log', label: 'Add daily log', href: `/daily-logs/new?project=${id}`, icon: 'daily_log' })
  }
  if (manager && features.estimates && status !== 'cancelled') {
    actions.push({ key: 'estimate', label: 'Create estimate', href: `/estimates/new?project=${id}`, icon: 'estimate' })
  }
  if (manager && features.invoices && status !== 'cancelled') {
    actions.push({ key: 'invoice', label: 'Create invoice', href: `/invoices/new?project=${id}`, icon: 'invoice' })
  }
  if (features.documents && canViewInternal) {
    actions.push({ key: 'document', label: 'Upload document', href: `${base}/documents?upload=1`, icon: 'document' })
  }
  // Same rule the database applies (rfi_can_ask): builder staff with internal access to this project.
  if (features.rfis && canViewInternal && role && STAFF_ROLES.includes(role)) {
    actions.push({ key: 'rfi', label: ASK_QUESTION_LABEL, href: `${base}/rfis?new=1`, icon: 'rfi', drawer: 'rfi', projectId })
  }
  return actions
}

export type FieldActionKey = 'daily_log' | 'photos' | 'punch_list' | 'contacts'
export type FieldQuickAction = { key: FieldActionKey; label: string; href: string | null }

/**
 * The four field shortcuts for the current job. Log and Photos reuse the per-job guards above, so they appear
 * exactly when the destination would accept them. Contacts opens an in-place sheet (no href) and only shows
 * when the job has someone to call. Unavailable actions are omitted rather than shown disabled.
 */
export function buildFieldQuickActions(input: Parameters<typeof buildProjectQuickActions>[0] & {
  walkthroughs: boolean
  hasContacts: boolean
}): FieldQuickAction[] {
  const base = buildProjectQuickActions(input)
  const find = (key: string) => base.find((a) => a.key === key)
  const actions: FieldQuickAction[] = []
  const log = find('daily_log')
  if (log) actions.push({ key: 'daily_log', label: 'Daily log', href: log.href })
  const upload = find('document')
  if (upload) actions.push({ key: 'photos', label: 'Photos', href: upload.href })
  if (input.walkthroughs && !input.archived) {
    actions.push({ key: 'punch_list', label: 'Punch list', href: `/projects/${encodeURIComponent(input.projectId)}/walkthroughs` })
  }
  if (input.hasContacts) actions.push({ key: 'contacts', label: 'Contacts', href: null })
  return actions
}

/** Records that do not belong to a single job. Same guards as their destination pages. */
export function buildGlobalQuickActions(input: { role: OrgRole | null; features: QuickActionFeatures }): QuickAction[] {
  const { role, features } = input
  const actions: QuickAction[] = []
  if (isManager(role)) {
    actions.push(
      { key: 'project', label: 'New project', href: '/projects/new', icon: 'project' },
      { key: 'client', label: 'New client', href: '/clients/new', icon: 'client' },
      { key: 'contact', label: 'New contact', href: '/contacts/people/new', icon: 'contact', drawer: 'contact' },
    )
    if (features.subcontractors) {
      actions.push({ key: 'subcontractor', label: 'New subcontractor', href: '/subcontractors/new', icon: 'subcontractor' })
    }
  }
  // Outside a project the drawer asks which project the question is for; nothing is preselected.
  if (features.rfis && role && STAFF_ROLES.includes(role)) {
    actions.push({ key: 'rfi', label: ASK_QUESTION_LABEL, href: '/projects', icon: 'rfi', drawer: 'rfi' })
  }
  return actions
}
