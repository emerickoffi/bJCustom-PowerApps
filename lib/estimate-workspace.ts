export const WORKSPACE_TABS = ['items', 'pricing', 'review', 'history'] as const
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]

export const WORKSPACE_TAB_LABELS: Record<WorkspaceTab, string> = {
  items: 'Cost items',
  pricing: 'Pricing & notes',
  review: 'Review & send',
  history: 'History & files',
}

export const isWorkspaceTab = (v: unknown): v is WorkspaceTab => WORKSPACE_TABS.includes(v as WorkspaceTab)

const UUID = /^[0-9a-f-]{36}$/i

/** Rebuilds the estimates-list query from `?from=`, keeping only the known list filters. */
export function estimatesListHref(from: string | undefined, statuses: readonly string[]) {
  const source = new URLSearchParams(from ?? '')
  const kept = new URLSearchParams()
  const project = source.get('project')
  const status = source.get('status')
  if (project && UUID.test(project)) kept.set('project', project)
  if (status && statuses.includes(status)) kept.set('status', status)
  const search = source.get('q')?.trim().slice(0, 100)
  if (search) kept.set('q', search)
  const qs = kept.toString()
  return { href: qs ? `/estimates?${qs}` : '/estimates', from: qs }
}
