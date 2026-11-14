import type { FeatureMap } from '@/lib/feature-registry'

export type ProjectNavKey =
  | 'overview'
  | 'schedule'
  | 'daily_logs'
  | 'photos'
  | 'client_updates'
  | 'estimates'
  | 'selections'
  | 'change_orders'
  | 'financials'
  | 'documents'
  | 'contacts'
  | 'walkthroughs'
  | 'warranty'
  | 'subcontractor_work'

export type ProjectNavItem = {
  key: ProjectNavKey
  label: string
  href: string
  // Route prefix that marks the tab active; section tabs on the overview page have none.
  activePrefix: string | null
}

export type ProjectNavAccess = {
  features: Pick<FeatureMap, 'schedule' | 'estimates' | 'documents' | 'walkthroughs' | 'warranty'> &
    Partial<Pick<FeatureMap, 'change_orders' | 'daily_logs' | 'client_updates' | 'subcontractors' | 'rfis' | 'project_photos'>>
  projectStatus: string
  canViewInternal: boolean
  // Administrators and project managers only; change orders carry internal costs.
  canViewFinancials?: boolean
}

// Anchors on the overview page; these must match the ids rendered by the overview panels.
export const PROJECT_SECTION_ANCHORS = {
  // No longer a tab; kept so existing #project-team links still scroll to the Project team card.
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
    Boolean(features.daily_logs && access.canViewInternal) && {
      key: 'daily_logs',
      label: 'Daily logs',
      href: `${base}/daily-logs`,
      activePrefix: `${base}/daily-logs`,
    },
    // Same rule as requirePhotosProject: internal access and at least one photo source switched on.
    Boolean(
      access.canViewInternal && (features.project_photos || features.daily_logs || features.walkthroughs || features.client_updates),
    ) && {
      key: 'photos',
      label: 'Photos',
      href: `${base}/photos`,
      activePrefix: `${base}/photos`,
    },
    Boolean(features.client_updates && access.canViewInternal) && {
      key: 'client_updates',
      label: 'Client updates',
      href: `${base}/client-updates`,
      activePrefix: `${base}/client-updates`,
    },
    features.estimates && {
      key: 'estimates',
      label: 'Estimates',
      // Stays inside the project shell; the org-wide /estimates?project= filter keeps working for existing links.
      href: `${base}/estimates`,
      activePrefix: `${base}/estimates`,
    },
    // Selections carry vendor costs, so they follow the same manager + internal access as financials.
    Boolean(features.estimates && access.canViewFinancials && access.canViewInternal) && {
      key: 'selections',
      label: 'Selections',
      href: `${base}/selections`,
      activePrefix: `${base}/selections`,
    },
    Boolean(features.change_orders && access.canViewFinancials && access.canViewInternal) && {
        key: 'change_orders',
        label: 'Change orders',
        href: `${base}/change-orders`,
        activePrefix: `${base}/change-orders`,
      },
    Boolean(features.estimates && access.canViewFinancials && access.canViewInternal) && {
      key: 'financials',
      label: 'Financials',
      href: `${base}/financials`,
      activePrefix: `${base}/financials`,
    },
    features.documents &&
      access.canViewInternal && {
        key: 'documents',
        label: 'Documents',
        href: `${base}/documents`,
        activePrefix: `${base}/documents`,
      },
    // Verification queue mirrors can_review_sub_project: managers with internal project access.
    Boolean(features.subcontractors && access.canViewFinancials && access.canViewInternal) && {
      key: 'subcontractor_work',
      label: 'Sub work',
      href: `${base}/subcontractor-work`,
      activePrefix: `${base}/subcontractor-work`,
    },
    { key: 'contacts', label: 'People', href: `${base}/contacts`, activePrefix: `${base}/contacts` },
    features.walkthroughs && {
      key: 'walkthroughs',
      label: 'Walkthroughs',
      href: `${base}/walkthroughs`,
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

export type ProjectMoreItem = { key: 'rfis'; label: string; href: string; activePrefix: string }

/**
 * Tools reached from the overflow menu at the end of the tab strip rather than a permanent tab.
 * Same guard as the pages themselves: the feature switch and internal access to this project.
 */
export function getProjectMoreItems(projectId: string, access: ProjectNavAccess): ProjectMoreItem[] {
  const base = projectBasePath(projectId)
  const items: ProjectMoreItem[] = []
  if (access.features.rfis && access.canViewInternal) {
    items.push({ key: 'rfis', label: 'Questions (RFIs)', href: `${base}/rfis`, activePrefix: `${base}/rfis` })
  }
  return items
}

export function getActiveProjectMoreKey(pathname: string, items: ProjectMoreItem[]): ProjectMoreItem['key'] | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  return items.find((item) => path === item.activePrefix || path.startsWith(`${item.activePrefix}/`))?.key ?? null
}

export type ProjectToolKey = ProjectNavKey | ProjectMoreItem['key']

export type ProjectTool = {
  key: ProjectToolKey
  label: string
  href: string
  activePrefix: string | null
  /** Extra words people search with, e.g. "RFI" finds Questions. */
  aliases: readonly string[]
}

export type ProjectToolGroupKey = 'work' | 'financials' | 'people' | 'files'

export type ProjectToolGroup = { key: ProjectToolGroupKey; label: string; tools: ProjectTool[] }

const TOOL_GROUPS: { key: ProjectToolGroupKey; label: string; tools: readonly ProjectToolKey[] }[] = [
  { key: 'work', label: 'Project work', tools: ['overview', 'schedule', 'daily_logs', 'selections', 'walkthroughs', 'warranty'] },
  { key: 'financials', label: 'Financials', tools: ['estimates', 'change_orders', 'financials'] },
  { key: 'people', label: 'People & communication', tools: ['contacts', 'subcontractor_work', 'rfis', 'client_updates'] },
  { key: 'files', label: 'Files', tools: ['documents', 'photos'] },
]

const TOOL_ALIASES: Record<ProjectToolKey, readonly string[]> = {
  overview: ['home', 'summary', 'details'],
  schedule: ['timeline', 'gantt', 'calendar', 'tasks'],
  daily_logs: ['log', 'journal', 'diary', 'field report'],
  selections: ['finishes', 'allowances', 'choices'],
  walkthroughs: ['punch', 'punch list', 'issues', 'inspection'],
  warranty: ['claims', 'service'],
  estimates: ['bid', 'quote', 'proposal', 'pricing'],
  change_orders: ['co', 'change order', 'changes'],
  financials: ['budget', 'costs', 'invoices', 'payments', 'money'],
  contacts: ['contacts', 'team', 'directory', 'client'],
  subcontractor_work: ['sub', 'subcontractor', 'trades', 'verification'],
  rfis: ['rfi', 'rfis', 'questions', 'request for information'],
  client_updates: ['homeowner', 'updates', 'messages', 'communication'],
  documents: ['files', 'docs', 'plans', 'contracts', 'drawings'],
  photos: ['images', 'pictures', 'gallery'],
}

/**
 * Every tool this user may open in the project, grouped for the Project Tools menu. Built from the same
 * guarded lists as before, so a tool appears only when its page would also let the user in.
 */
export function getProjectToolGroups(projectId: string, access: ProjectNavAccess): ProjectToolGroup[] {
  const available = new Map<ProjectToolKey, ProjectTool>()
  for (const item of [...getProjectNavItems(projectId, access), ...getProjectMoreItems(projectId, access)]) {
    available.set(item.key, { ...item, aliases: TOOL_ALIASES[item.key] })
  }
  const grouped = new Set<ProjectToolKey>()
  const groups = TOOL_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    tools: group.tools.flatMap((key) => {
      const tool = available.get(key)
      if (!tool) return []
      grouped.add(key)
      return [tool]
    }),
  }))
  // A tool added later without a group still stays reachable rather than silently disappearing.
  const ungrouped = [...available.values()].filter((tool) => !grouped.has(tool.key))
  if (ungrouped.length) groups[0].tools.push(...ungrouped)
  return groups.filter((group) => group.tools.length > 0)
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Keeps tools whose name or an alias contains every word typed; groups left empty are dropped. */
export function filterProjectToolGroups(groups: ProjectToolGroup[], query: string): ProjectToolGroup[] {
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return groups
  return groups
    .map((group) => ({
      ...group,
      tools: group.tools.filter((tool) => {
        const haystack = [tool.label, ...tool.aliases].map(normalize).join(' | ')
        return words.every((word) => haystack.includes(word))
      }),
    }))
    .filter((group) => group.tools.length > 0)
}

export function getActiveProjectToolKey(pathname: string, projectId: string, tools: ProjectTool[]): ProjectToolKey | null {
  const base = projectBasePath(projectId)
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === base) return tools.some((tool) => tool.key === 'overview') ? 'overview' : null
  const match = tools.find((tool) => tool.activePrefix && (path === tool.activePrefix || path.startsWith(`${tool.activePrefix}/`)))
  return match?.key ?? null
}

export function getActiveProjectNavKey(pathname: string, projectId: string, items: ProjectNavItem[]): ProjectNavKey | null {
  const base = projectBasePath(projectId)
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === base) return 'overview'
  const match = items.find((item) => item.activePrefix && (path === item.activePrefix || path.startsWith(`${item.activePrefix}/`)))
  return match?.key ?? null
}
