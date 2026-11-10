import type { QuickActionIcon } from '@/lib/quick-actions'

export type LauncherIcon = QuickActionIcon | 'company' | 'quote' | 'camera' | 'gallery' | 'save' | 'ai'

/** Most contextual pills shown at once. Touch reserves one place for the explicit "Ask AI" pill. */
export const LAUNCHER_MAX_ACTIONS = { pointer: 4, touch: 3 } as const

/**
 * Stable ids of the launcher's sources:
 * - `project:<key>` — a project action from the Quick Create catalog (buildProjectQuickActions), already
 *   checked against role, features and project state, and only used for the project the route shows.
 * - `global:<key>` — a standalone action from buildGlobalQuickActions.
 * - anything else — an action a page registers through useLauncherAction (e.g. `assign`, `quote-request`).
 */
type Plan = { projectId: string | null; order: string[] }

const PROJECT_ROUTE = /^\/projects\/([^/]+)(\/.*)?$/

/** Launcher labels that differ from the Quick Create wording. */
export const LAUNCHER_LABELS: Record<string, string> = {
  'project:schedule': 'Add activity',
}

/**
 * Page-specific pills, nearest the launcher first. Ids a page does not provide are skipped, so only working,
 * authorized actions appear. Registered actions the plan does not list follow in their own priority.
 */
export function launcherPlanFor(pathname: string): Plan {
  if (pathname === '/projects') return { projectId: null, order: ['global:project'] }
  const match = PROJECT_ROUTE.exec(pathname)
  if (!match || match[1] === 'new') return { projectId: null, order: [] }
  const projectId = decodeURIComponent(match[1])
  const tab = match[2] ?? ''
  if (tab === '') return { projectId, order: ['project:daily_log', 'assign', 'project:document'] }
  if (tab.startsWith('/schedule')) return { projectId, order: ['project:schedule', 'assign', 'project:daily_log'] }
  if (tab.startsWith('/subcontractor-work')) return { projectId, order: ['quote-request', 'assign'] }
  if (tab.startsWith('/documents')) return { projectId, order: ['project:document'] }
  return { projectId, order: [] }
}
