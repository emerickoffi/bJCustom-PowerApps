export type BottomTabKey = 'home' | 'projects' | 'my-work' | 'schedule' | 'daily-logs' | 'time'
export type BottomTab = { key: BottomTabKey; href: string; label: string }

/**
 * Tablet tabs: the phone's field-first set with one more slot. Home (My Work for project managers), Projects,
 * Daily Logs, Time, Schedule; My Work fills in when a field module is off. At most five, plus More.
 */
export function bottomNavTabs(availableHrefs: readonly string[], homeHref: string): BottomTab[] {
  return fieldTabs(availableHrefs, homeHref, ['projects', 'daily-logs', 'time', 'schedule', 'my-work'], 5)
}

const CANDIDATES: Record<Exclude<BottomTabKey, 'home'>, BottomTab> = {
  'daily-logs': { key: 'daily-logs', href: '/daily-logs', label: 'Daily Logs' },
  time: { key: 'time', href: '/time', label: 'Time' },
  projects: { key: 'projects', href: '/projects', label: 'Projects' },
  'my-work': { key: 'my-work', href: '/my-work', label: 'My Work' },
  schedule: { key: 'schedule', href: '/schedule', label: 'Schedule' },
}

function fieldTabs(
  availableHrefs: readonly string[],
  homeHref: string,
  order: Exclude<BottomTabKey, 'home'>[],
  max: number,
): BottomTab[] {
  const tabs: BottomTab[] = [{ key: 'home', href: homeHref, label: homeHref === '/my-work' ? 'My Work' : 'Home' }]
  for (const key of order) {
    if (tabs.length >= max) break
    const tab = CANDIDATES[key]
    if (tab.href !== homeHref && availableHrefs.includes(tab.href)) tabs.push(tab)
  }
  return tabs
}

/**
 * Phone tabs are field-first: Home (My Work for project managers), Daily Logs and Time, then Projects. Office roles
 * without the field modules fall back to My Work and Schedule. At most four, plus More; the rest lives in More.
 */
export function phoneNavTabs(availableHrefs: readonly string[], homeHref: string): BottomTab[] {
  return fieldTabs(availableHrefs, homeHref, ['daily-logs', 'time', 'projects', 'my-work', 'schedule'], 4)
}

export function isTabActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
