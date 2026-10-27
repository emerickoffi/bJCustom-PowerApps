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
  { href: '/schedule', label: 'Schedule', icon: 'schedule', feature: 'schedule' },
  { href: '/estimates', label: 'Estimates', icon: 'estimates', feature: 'estimates' },
  { href: '/invoices', label: 'Invoices', icon: 'invoices', feature: 'invoices' },
  { href: '/warranty', label: 'Warranty', icon: 'warranty', feature: 'warranty' },
  { href: '/team', label: 'Team', icon: 'team', roles: ['org_admin'] },
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
  {
    slug: 'documents',
    label: 'Documents',
    icon: 'documents',
    stage: 4,
    summary: 'Plans, permits, contracts, and photos with per-document homeowner visibility.',
  },
  {
    slug: 'daily-logs',
    label: 'Daily Logs',
    icon: 'daily-logs',
    stage: 4,
    summary: 'Site activity, weather, crews on site, and progress photos recorded each day.',
  },
  {
    slug: 'invoices',
    label: 'Invoices',
    icon: 'invoices',
    stage: 5,
    summary: 'Draw schedules, progress billing, payment tracking, and homeowner statements.',
  },
]

export function navForRole(role: OrgRole | null, features?: FeatureMap): NavItem[] {
  return PRIMARY_NAV.filter(
    (item) =>
      (!item.roles || (role && item.roles.includes(role))) && (!item.feature || !features || features[item.feature]),
  )
}
