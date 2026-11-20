export type BottomTabKey = 'home' | 'projects' | 'my-work' | 'schedule' | 'daily-logs' | 'time'
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

/**
 * Phone tabs are field-first: Home (My Work for project managers), Daily Logs and Time, then Projects. Office roles
 * without the field modules fall back to My Work and Schedule. At most four, plus More; the rest lives in More.
 */
export function phoneNavTabs(availableHrefs: readonly string[], homeHref: string): BottomTab[] {
  const has = (href: string) => availableHrefs.includes(href)
  const tabs: BottomTab[] = [{ key: 'home', href: homeHref, label: homeHref === '/my-work' ? 'My Work' : 'Home' }]
  const candidates: BottomTab[] = [
    { key: 'daily-logs', href: '/daily-logs', label: 'Daily Logs' },
    { key: 'time', href: '/time', label: 'Time' },
    { key: 'projects', href: '/projects', label: 'Projects' },
    { key: 'my-work', href: '/my-work', label: 'My Work' },
    { key: 'schedule', href: '/schedule', label: 'Schedule' },
  ]
  for (const tab of candidates) {
    if (tabs.length >= 4) break
    if (tab.href !== homeHref && has(tab.href)) tabs.push(tab)
  }
  return tabs
}

export function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
