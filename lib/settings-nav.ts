export type SettingsNavItem = { href: string; label: string }

export const SETTINGS_ROOT = '/settings'

export function buildSettingsNav(features: { schedule?: boolean; estimates?: boolean }): SettingsNavItem[] {
  return [
    { href: SETTINGS_ROOT, label: 'Company profile' },
    { href: '/settings/integrations', label: 'Integrations' },
    { href: '/settings/dashboard', label: 'Dashboard' },
    { href: '/settings/features', label: 'Feature management' },
    ...(features.schedule ? [{ href: '/settings/templates', label: 'Project templates' }] : []),
    ...(features.estimates
      ? [
          { href: '/settings/proposal-templates', label: 'Document templates' },
          { href: '/settings/selection-categories', label: 'Selection categories' },
        ]
      : []),
    { href: '/settings/roles', label: 'Roles & permissions' },
  ]
}

/** The root tab matches only itself; every other tab also owns its nested routes. */
export function getActiveSettingsHref(pathname: string, items: SettingsNavItem[]): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  let best: string | null = null
  for (const { href } of items) {
    const matches = href === SETTINGS_ROOT ? path === href : path === href || path.startsWith(`${href}/`)
    if (matches && (!best || href.length > best.length)) best = href
  }
  return best
}
