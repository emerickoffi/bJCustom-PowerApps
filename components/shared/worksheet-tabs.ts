import { cn } from '@/lib/utils'

/** Connected spreadsheet-style tabs shared by project and estimate workspaces. */
export function worksheetTabClass(active: boolean, first: boolean) {
  return cn(
    'relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-t-md border-r border-t border-border px-4 text-sm transition-colors',
    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40',
    first && 'border-l',
    active
      ? 'h-12 border-b border-b-card bg-card font-semibold text-foreground before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:rounded-t-md before:bg-primary sm:h-10'
      : 'h-11 border-b bg-muted/70 font-medium text-muted-foreground hover:bg-muted hover:text-foreground sm:h-9',
  )
}

export const worksheetStripClass =
  'overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

export const worksheetFillerClass = 'min-w-4 flex-1 self-stretch border-b border-border'

/** Underlined secondary tabs that sit inside a worksheet, visibly subordinate to the worksheet tabs above. */
export const sectionTabStripClass =
  'overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

export const sectionTabListClass = 'flex min-w-max gap-1 shadow-[inset_0_-1px_0_var(--border)]'

export function sectionTabClass(active: boolean) {
  return cn(
    'flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors sm:min-h-10',
    'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring',
    active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
  )
}
