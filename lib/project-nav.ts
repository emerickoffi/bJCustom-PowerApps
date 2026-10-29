import type { FeatureMap } from '@/lib/feature-registry'

export type ProjectNavKey = 'overview' | 'schedule' | 'estimates' | 'change_orders' | 'documents' | 'team' | 'walkthroughs' | 'warranty'

export type ProjectNavItem = {
  key: ProjectNavKey
  label: string
  href: string
  // Route prefix that marks the tab active; section tabs on the overview page have none.
  activePrefix: string | null
}

export type ProjectNavAccess = {
  features: Pick<FeatureMap, 'schedule' | 'estimates' | 'documents' | 'walkthroughs' | 'warranty'> &
    Partial<Pick<FeatureMap, 'change_orders'>>
  projectStatus: string
  canViewInternal: boolean
  // Administrators and project managers only; change orders carry internal costs.
  canViewFinancials?: boolean
}

// Anchors on the overview page; these must match the ids rendered by the overview panels.
export const PROJECT_SECTION_ANCHORS = {
  team: 'project-team',
  walkthroughs: 'walkthroughs-heading',
} as const

const SECTION_IDS: readonly string[] = Object.values(PROJECT_SECTION_ANCHORS)

export function isProjectSectionId(id: string) {
  return SECTION_IDS.includes(id)
}

export function projectBasePath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
}

// Returns the overview section id targeted by a nav href, or null for dedicated pages.
export function getSectionIdFromHref(href: string): string | null {
  const hashIndex = href.indexOf('#')
  if (hashIndex === -1) return null
  const id = decodeURIComponent(href.slice(hashIndex + 1))
  return isProjectSectionId(id) ? id : null
}

export function getProjectNavItems(projectId: string, access: ProjectNavAccess): ProjectNavItem[] {
  const base = projectBasePath(projectId)
  const { features } = access
  const items: (ProjectNavItem | false)[] = [
    { key: 'overview', label: 'Overview', href: base, activePrefix: null },
    features.schedule && { key: 'schedule', label: 'Schedule', href: `${base}/schedule`, activePrefix: `${base}/schedule` },
    features.estimates && {
      key: 'estimates',
      label: 'Estimates',
      // Reuses the Estimates module's validated, organization-scoped project filter.
      href: `/estimates?project=${encodeURIComponent(projectId)}`,
      activePrefix: null,
    },
    Boolean(features.change_orders && access.canViewFinancials && access.canViewInternal) && {
        key: 'change_orders',
        label: 'Change orders',
        href: `${base}/change-orders`,
        activePrefix: `${base}/change-orders`,
      },
    features.documents &&
      access.canViewInternal && {
        key: 'documents',
        label: 'Documents',
        href: `${base}/documents`,
        activePrefix: `${base}/documents`,
      },
    { key: 'team', label: 'Team', href: `${base}#${PROJECT_SECTION_ANCHORS.team}`, activePrefix: null },
    features.walkthroughs && {
      key: 'walkthroughs',
      label: 'Walkthroughs',
      href: `${base}#${PROJECT_SECTION_ANCHORS.walkthroughs}`,
      activePrefix: `${base}/walkthroughs`,
    },
    features.warranty &&
      access.projectStatus === 'completed' && {
        key: 'warranty',
        label: 'Warranty',
        href: `${base}/warranty`,
        activePrefix: `${base}/warranty`,
      },
  ]
  return items.filter((item): item is ProjectNavItem => Boolean(item))
}

export function getActiveProjectNavKey(pathname: string, projectId: string, items: ProjectNavItem[]): ProjectNavKey | null {
  const base = projectBasePath(projectId)
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === base) return 'overview'
  const match = items.find((item) => item.activePrefix && (path === item.activePrefix || path.startsWith(`${item.activePrefix}/`)))
  return match?.key ?? null
}
