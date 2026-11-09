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
