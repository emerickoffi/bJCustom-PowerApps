export type BottomTabKey = 'home' | 'projects' | 'my-work' | 'schedule'
export type BottomTab = { key: BottomTabKey; href: string; label: string }

/**
 * Primary tabs for the phone and tablet bottom navigation: Home, Projects, then My Work and Schedule when the
 * role can open them. Everything else stays in More, so the bar never shows a route the role cannot reach.
 */
export function bottomNavTabs(availableHrefs: readonly string[], homeHref: string): BottomTab[] {
  const has = (href: string) => availableHrefs.includes(href)
  const tabs: BottomTab[] = [
    { key: 'home', href: homeHref, label: 'Home' },
    { key: 'projects', href: '/projects', label: 'Projects' },
  ]
  if (has('/my-work') && homeHref !== '/my-work') tabs.push({ key: 'my-work', href: '/my-work', label: 'My Work' })
  if (has('/schedule')) tabs.push({ key: 'schedule', href: '/schedule', label: 'Schedule' })
  return tabs
}

export function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
