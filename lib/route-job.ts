/**
 * The global project selector is derived from the URL only. A project route (/projects/[id]/...) or an
 * explicit `?project=` filter on a page that supports one is the single source of truth; every other page
 * is company-wide and shows "All projects". Nothing is remembered between pages.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isProjectId = (value: string | null | undefined): value is string => Boolean(value && UUID.test(value))

/** Company-wide pages whose content genuinely filters by `?project=`. */
export type ProjectFilterRoute = '/schedule' | '/dashboard'

export type RouteJobScope =
  | { kind: 'project'; projectId: string; section: string | null }
  | { kind: 'filter'; route: ProjectFilterRoute; projectId: string | null; rawParam: string | null }
  | { kind: 'company' }

export function resolveRouteJob(
  pathname: string,
  searchParams: { get(name: string): string | null },
  filterRoutes: readonly ProjectFilterRoute[],
): RouteJobScope {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'projects' && isProjectId(parts[1])) {
    const section = parts[2] && !isProjectId(parts[2]) && parts[2] !== 'new' ? parts[2] : null
    return { kind: 'project', projectId: parts[1], section }
  }
  const route = filterRoutes.find((r) => r === pathname)
  if (route) {
    const rawParam = searchParams.get('project')
    return { kind: 'filter', route, projectId: isProjectId(rawParam) ? rawParam : null, rawParam }
  }
  return { kind: 'company' }
}

function withProjectParam(route: string, searchParams: URLSearchParams, value: string | null) {
  const next = new URLSearchParams(searchParams)
  if (value) next.set('project', value)
  else next.delete('project')
  const qs = next.toString()
  return qs ? `${route}?${qs}` : route
}

/** Where choosing a project (or "All projects", when `projectId` is null) should navigate. Null = stay put. */
export function switchDestination(
  scope: RouteJobScope,
  searchParams: URLSearchParams,
  projectId: string | null,
): string | null {
  if (scope.kind === 'project') {
    if (!projectId) return '/projects'
    return `/projects/${encodeURIComponent(projectId)}${scope.section ? `/${scope.section}` : ''}`
  }
  if (scope.kind === 'filter') {
    if (projectId) return withProjectParam(scope.route, searchParams, projectId)
    // Schedule's company-wide overview is an explicit `all`; the dashboard's is simply no filter.
    return withProjectParam(scope.route, searchParams, scope.route === '/schedule' ? 'all' : null)
  }
  return projectId ? `/projects/${encodeURIComponent(projectId)}` : null
}
