import type { OrgRole } from '@/lib/domain'
import type { FeatureKey, FeatureMap } from '@/lib/feature-registry'

export type NavItem = {
  href: string
  label: string
  icon: string
  roles?: OrgRole[]
  feature?: FeatureKey
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/projects', label: 'Projects', icon: 'projects' },
  { href: '/clients', label: 'Clients', icon: 'clients' },
  { href: '/subcontractors', label: 'Subcontractors', icon: 'subcontractors', roles: ['org_admin', 'project_manager'], feature: 'subcontractors' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts', roles: ['org_admin', 'project_manager'] },
  { href: '/schedule', label: 'Schedule', icon: 'schedule', feature: 'schedule' },
  { href: '/daily-logs', label: 'Daily Logs', icon: 'daily-logs', roles: ['org_admin', 'project_manager', 'builder_staff'], feature: 'daily_logs' },
  { href: '/estimates', label: 'Estimates', icon: 'estimates', feature: 'estimates' },
  { href: '/invoices', label: 'Invoices', icon: 'invoices', feature: 'invoices' },
  { href: '/documents', label: 'Documents', icon: 'documents', feature: 'documents' },
  { href: '/warranty', label: 'Warranty', icon: 'warranty', feature: 'warranty' },
  { href: '/team', label: 'Users & Access', icon: 'team', roles: ['org_admin'] },
  { href: '/settings', label: 'Settings', icon: 'settings', roles: ['org_admin'] },
]

export type PlannedModule = {
  slug: string
  label: string
  icon: string
  stage: number
  summary: string
}

export const PLANNED_MODULES: PlannedModule[] = [
  {
    slug: 'selections',
    label: 'Selections',
    icon: 'selections',
    stage: 3,
    summary: 'Finish and fixture selections with deadlines, allowances, and homeowner approvals.',
  },
  {
    slug: 'change-orders',
    label: 'Change Orders',
    icon: 'change-orders',
    stage: 3,
    summary: 'Scope and price changes with electronic homeowner approval and budget impact.',
  },
]

/** Former placeholder slugs that now have a real module; old bookmarks redirect there. */
export const GRADUATED_MODULE_ROUTES: Record<string, string> = {
  schedule: '/schedule',
  invoices: '/invoices',
  'daily-logs': '/daily-logs',
}

export const MY_WORK_NAV: NavItem = { href: '/my-work', label: 'My Work', icon: 'my-work', roles: ['project_manager'] }

const PROJECT_MANAGER_PRIORITY = ['/my-work', '/projects', '/schedule', '/documents']

function priorityRank(href: string): number {
  const rank = PROJECT_MANAGER_PRIORITY.indexOf(href)
  return rank === -1 ? PROJECT_MANAGER_PRIORITY.length : rank
}

/** Presentation only: which items to show and in what order. Access is still enforced by each page and by RLS. */
export function navForRole(role: OrgRole | null, features?: FeatureMap): NavItem[] {
  const items = [MY_WORK_NAV, ...PRIMARY_NAV].filter(
    (item) =>
      (!item.roles || (role && item.roles.includes(role))) && (!item.feature || !features || features[item.feature]),
  )
  if (role !== 'project_manager') return items
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => priorityRank(a.item.href) - priorityRank(b.item.href) || a.index - b.index)
    .map(({ item }) => item)
}

export function landingPathForRole(role: OrgRole | null): string {
  if (role === 'client') return '/portal'
  if (role === 'project_manager') return '/my-work'
  return '/dashboard'
}
