export const SIDEBAR_COOKIE = 'sidebar_collapsed'

/** `auto` = no saved choice: compact on tablet-width screens (below xl), expanded on desktop. */
export type SidebarMode = 'auto' | 'collapsed' | 'expanded'

export function parseSidebarMode(value: string | undefined): SidebarMode {
  if (value === '1') return 'collapsed'
  if (value === '0') return 'expanded'
  return 'auto'
}
