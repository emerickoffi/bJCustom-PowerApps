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

export type QuickAction = { key: string; label: string; href: string; icon: QuickActionIcon }

type QuickActionFeatures = Partial<
  Record<'schedule' | 'estimates' | 'documents' | 'daily_logs' | 'invoices' | 'subcontractors', boolean>
>

const isManager = (role: OrgRole | null) => role === 'org_admin' || role === 'project_manager'
const DAILY_LOG_ROLES: OrgRole[] = ['org_admin', 'project_manager', 'builder_staff']

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
  return actions
}

/** Records that do not belong to a single job. Same guards as their destination pages. */
export function buildGlobalQuickActions(input: { role: OrgRole | null; features: QuickActionFeatures }): QuickAction[] {
  const { role, features } = input
  if (!isManager(role)) return []
  const actions: QuickAction[] = [
    { key: 'project', label: 'New project', href: '/projects/new', icon: 'project' },
    { key: 'client', label: 'New client', href: '/clients/new', icon: 'client' },
    { key: 'contact', label: 'New contact', href: '/contacts/people/new', icon: 'contact' },
  ]
  if (features.subcontractors) {
    actions.push({ key: 'subcontractor', label: 'New subcontractor', href: '/subcontractors/new', icon: 'subcontractor' })
  }
  return actions
}
