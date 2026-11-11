import type { QuickActionIcon } from '@/lib/quick-actions'

export type LauncherIcon = QuickActionIcon | 'company' | 'quote' | 'camera' | 'gallery' | 'save' | 'ai'

/** Most shortcut pills shown at once. Touch reserves one place for the explicit "Ask AI" pill. */
export const LAUNCHER_MAX_ACTIONS = { pointer: 6, touch: 5 } as const

/**
 * Stable ids of the launcher's sources:
 * - `global:<key>` — a standalone Quick Create action (buildGlobalQuickActions).
 * - `ctx:<key>` — a job action. On a project route it comes from that project's Quick Create catalog; with a
 *   project preview open it targets the previewed project; otherwise it asks for the project first.
 * - anything else — an action a page registers through useLauncherAction (e.g. `quote-request`, camera pills).
 */
export type LauncherProject = { id: string; source: 'route' | 'preview' }
type Plan = { project: LauncherProject | null; contextual: string[] }

/** Shortcuts kept on every page after the page's own, nearest the launcher first. */
export const COMMON_LAUNCHER_ACTIONS = [
  'global:project',
  'global:client',
  'global:contact',
  'global:subcontractor',
  'ctx:daily_log',
  'ctx:document',
]

/** Page registrations that replace a catalog action with an in-place version of the same workflow. */
export const LAUNCHER_ALIASES: Record<string, string> = {
  'create-contact': 'global:contact',
  'create-client': 'global:client',
  assign: 'ctx:assign',
}

/** Launcher wording where it differs from the Quick Create menu. */
export const LAUNCHER_LABELS: Record<string, string> = {
  'global:client': 'Add client',
  'global:contact': 'Add contact',
  'global:subcontractor': 'Add subcontractor',
  'ctx:schedule': 'Add activity',
}

const PROJECT_ROUTE = /^\/projects\/([^/]+)(\/.*)?$/

/**
 * Launcher ids that the page's visible header button already performs in the same scope. The launcher omits them
 * so each page keeps a single primary entry point. Only header buttons count, not empty-state ones, and each
 * button uses the same permission guard as its catalog action. Distinct workflows stay in the launcher, e.g.
 * assigning an existing subcontractor beside "Add subcontractor", or a project upload on the company library tab.
 */
export function pageButtonLauncherIds(pathname: string, search: { get(key: string): string | null } | null): string[] {
  switch (pathname) {
    case '/projects':
      return ['global:project']
    case '/subcontractors':
      return ['global:subcontractor']
    case '/daily-logs':
      return ['ctx:daily_log']
    case '/documents':
      return search?.get('tab') === 'company' ? [] : ['ctx:document']
  }
  const match = PROJECT_ROUTE.exec(pathname)
  if (!match || match[1] === 'new') return []
  switch (match[2]) {
    case '/daily-logs':
      return ['ctx:daily_log']
    case '/documents':
      return ['ctx:document']
    case '/schedule':
      return ['ctx:schedule']
    case '/subcontractor-work/quotes':
      return ['quote-request']
  }
  return []
}

/** Page-specific shortcuts, nearest the launcher first. Ids a page cannot provide are skipped. */
export function launcherPlanFor(pathname: string, previewProjectId: string | null): Plan {
  if (pathname === '/projects') {
    return previewProjectId
      ? {
          project: { id: previewProjectId, source: 'preview' },
          contextual: ['ctx:assign', 'ctx:daily_log', 'ctx:document', 'global:project'],
        }
      : { project: null, contextual: ['global:project'] }
  }
  if (pathname.startsWith('/contacts')) return { project: null, contextual: ['global:contact', 'create-company'] }
  if (pathname.startsWith('/clients')) return { project: null, contextual: ['global:client'] }
  if (pathname.startsWith('/subcontractors')) return { project: null, contextual: ['global:subcontractor', 'ctx:assign'] }
  if (pathname.startsWith('/schedule')) return { project: null, contextual: ['ctx:schedule', 'ctx:daily_log'] }
  if (pathname.startsWith('/daily-logs')) return { project: null, contextual: ['ctx:daily_log'] }
  if (pathname.startsWith('/documents')) return { project: null, contextual: ['ctx:document'] }

  const match = PROJECT_ROUTE.exec(pathname)
  if (!match || match[1] === 'new') return { project: null, contextual: [] }
  const project: LauncherProject = { id: decodeURIComponent(match[1]), source: 'route' }
  const tab = match[2] ?? ''
  if (tab.startsWith('/schedule')) {
    return { project, contextual: ['ctx:schedule', 'ctx:daily_log', 'ctx:assign', 'ctx:document'] }
  }
  if (tab.startsWith('/subcontractor-work')) {
    return { project, contextual: ['quote-request', 'ctx:assign', 'ctx:daily_log', 'ctx:document'] }
  }
  if (tab.startsWith('/documents')) return { project, contextual: ['ctx:document', 'ctx:daily_log', 'ctx:assign'] }
  return { project, contextual: ['ctx:assign', 'ctx:daily_log', 'ctx:document', 'quote-request', 'ctx:schedule'] }
}
