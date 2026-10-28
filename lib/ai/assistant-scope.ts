/**
 * Pure helpers shared by the assistant drawer and the assistant API.
 * The module is only a hint: the server re-checks access before using it.
 */

export const ASSISTANT_MODULES = [
  'dashboard',
  'overview',
  'schedule',
  'documents',
  'issues',
  'walkthroughs',
  'warranty',
  'edit',
] as const
export type AssistantModule = (typeof ASSISTANT_MODULES)[number]

export const ASSISTANT_MODULE_LABELS: Record<AssistantModule, string> = {
  dashboard: 'Dashboard',
  overview: 'Overview',
  schedule: 'Schedule',
  documents: 'Documents',
  issues: 'Punch list',
  walkthroughs: 'Walkthroughs',
  warranty: 'Warranty',
  edit: 'Project details',
}

const PROJECT_SUBPAGES: Partial<Record<string, AssistantModule>> = {
  schedule: 'schedule',
  documents: 'documents',
  issues: 'issues',
  walkthroughs: 'walkthroughs',
  warranty: 'warranty',
  edit: 'edit',
}

export function isAssistantModule(value: unknown): value is AssistantModule {
  return typeof value === 'string' && (ASSISTANT_MODULES as readonly string[]).includes(value)
}

/** The page module for the current route, or null when the page has no specific assistant focus. */
export function moduleForPath(pathname: string, projectId: string | null): AssistantModule | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (!projectId) return path === '/dashboard' ? 'dashboard' : null
  const base = `/projects/${encodeURIComponent(projectId)}`
  if (path === base) return 'overview'
  if (!path.startsWith(`${base}/`)) return null
  return PROJECT_SUBPAGES[path.slice(base.length + 1).split('/')[0]] ?? null
}

/** Retrieval the signed-in user actually has for the current scope. Suggestions never exceed it. */
export type AssistantCapabilities = { schedule: boolean; documents: boolean; signatures: boolean }

export function suggestionsFor(
  module: AssistantModule | null,
  inProject: boolean,
  capabilities: AssistantCapabilities,
): string[] {
  if (!inProject) {
    return module === 'dashboard'
      ? ['Summarize my accessible projects.', 'Which projects need attention?', 'Show recently completed projects.']
      : []
  }
  switch (module) {
    case 'overview':
      return [
        'Summarize this project.',
        'What needs my attention?',
        'Who is assigned to this project?',
        'What is the current construction status?',
      ]
    case 'schedule':
      return capabilities.schedule
        ? ['What activities are upcoming?', 'Are any activities overdue?', 'Summarize schedule progress.']
        : []
    case 'documents':
      if (!capabilities.documents) return []
      return capabilities.signatures
        ? ['What documents are available?', 'Are any signatures pending?']
        : ['What documents are available?']
    default:
      return []
  }
}

export type AssistantLink = { key: string; label: string; href: string }

const LINK_MARKER = /\[\[link:([a-z0-9_:.-]{1,60})\]\]/gi

/**
 * Replaces the model's [[link:key]] markers with links from the server-built allowlist.
 * Unknown keys are dropped, so the model can never produce a route of its own.
 */
export function extractLinks(text: string, allowed: AssistantLink[], max = 3): { text: string; links: AssistantLink[] } {
  const byKey = new Map(allowed.map((l) => [l.key.toLowerCase(), l]))
  const links: AssistantLink[] = []
  const cleaned = text.replace(LINK_MARKER, (_, key: string) => {
    const link = byKey.get(key.toLowerCase())
    if (link && links.length < max && !links.some((l) => l.href === link.href)) links.push(link)
    return ''
  })
  return {
    text: cleaned
      .split('\n')
      .map((line) => line.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    links,
  }
}

/** Only same-origin app paths are ever rendered as links. */
export function isSafeAppPath(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.includes('\\') && !/^\/[a-z]+:/i.test(href)
}
