import type { OrgRole } from '@/lib/domain'
import type { FeatureKey, FeatureMap } from '@/lib/feature-registry'

export type NavItem = {
  href: string
  label: string
  icon: string
  roles?: OrgRole[]
  feature?: FeatureKey
  group?: NavGroup
}

export type NavGroup = 'workspace' | 'financials' | 'people' | 'services' | 'admin'

/** Comma-separated groups the user collapsed. Read on the server so the first paint matches. */
export const NAV_GROUPS_COOKIE = 'sidebar_groups_closed'

/** Always-visible primary tools; every other group can be collapsed. */
export const PERSISTENT_NAV_GROUP: NavGroup = 'workspace'

export function parseClosedNavGroups(value: string | undefined): NavGroup[] {
  if (!value) return []
  const known = new Set<string>(['financials', 'people', 'services', 'admin'])
  return value.split(',').filter((key): key is NavGroup => known.has(key))
}

export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'financials', label: 'Financials' },
  { key: 'people', label: 'People & partners' },
  { key: 'services', label: 'Project services' },
  { key: 'admin', label: 'Administration' },
]

export const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', group: 'workspace' },
  { href: '/projects', label: 'Projects', icon: 'projects', group: 'workspace' },
  { href: '/clients', label: 'Clients', icon: 'clients', group: 'people' },
  { href: '/contacts', label: 'Contacts', icon: 'contacts', roles: ['org_admin', 'project_manager'], group: 'people' },
  { href: '/subcontractors', label: 'Subcontractors', icon: 'subcontractors', roles: ['org_admin', 'project_manager'], feature: 'subcontractors', group: 'people' },
  { href: '/schedule', label: 'Schedule', icon: 'schedule', feature: 'schedule', group: 'workspace' },
  { href: '/daily-logs', label: 'Daily Logs', icon: 'daily-logs', roles: ['org_admin', 'project_manager', 'builder_staff'], feature: 'daily_logs', group: 'workspace' },
  { href: '/estimates', label: 'Estimates', icon: 'estimates', feature: 'estimates', group: 'financials' },
  { href: '/invoices', label: 'Invoices', icon: 'invoices', feature: 'invoices', group: 'financials' },
  { href: '/documents', label: 'Documents', icon: 'documents', feature: 'documents', group: 'services' },
  { href: '/warranty', label: 'Warranty', icon: 'warranty', feature: 'warranty', group: 'services' },
  { href: '/team', label: 'Users & Access', icon: 'team', roles: ['org_admin'], group: 'people' },
  { href: '/settings', label: 'Settings', icon: 'settings', roles: ['org_admin'], group: 'admin' },
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

export const MY_WORK_NAV: NavItem = { href: '/my-work', label: 'My Work', icon: 'my-work', roles: ['project_manager'], group: 'workspace' }

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
