import type { FeatureMap } from '@/lib/feature-registry'

export type ProjectNavKey = 'overview' | 'schedule' | 'estimates' | 'documents' | 'team' | 'walkthroughs' | 'warranty'

export type ProjectNavItem = {
  key: ProjectNavKey
  label: string
  href: string
  // Route prefix that marks the tab active; section tabs on the overview page have none.
  activePrefix: string | null
}

export type ProjectNavAccess = {
  features: Pick<FeatureMap, 'schedule' | 'estimates' | 'documents' | 'walkthroughs' | 'warranty'>
  projectStatus: string
  canViewInternal: boolean
}

// Anchors on the overview page; these must match the ids rendered by the overview panels.
export const PROJECT_SECTION_ANCHORS = {
  estimates: 'estimates-heading',
  team: 'project-team',
  walkthroughs: 'walkthroughs-heading',
} as const

export function projectBasePath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
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
      href: `${base}#${PROJECT_SECTION_ANCHORS.estimates}`,
      activePrefix: null,
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
