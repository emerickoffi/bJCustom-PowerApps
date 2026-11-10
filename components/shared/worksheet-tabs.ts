import { cn } from '@/lib/utils'

/**
 * `default` is the primary worksheet row (project and estimate workspaces, list filters).
 * `compact` is a secondary row inside a worksheet: same construction, smaller, so the primary row stays dominant.
 */
export type WorksheetTabSize = 'default' | 'compact'

const TAB_SIZE: Record<WorksheetTabSize, { base: string; active: string; inactive: string }> = {
  default: {
    base: 'gap-2 px-4 text-sm',
    active: 'h-12 before:h-[3px] sm:h-10',
    inactive: 'h-11 sm:h-9',
  },
  compact: {
    base: 'gap-1.5 px-3 text-[13px]',
    active: 'h-10 before:h-0.5 sm:h-8',
    inactive: 'h-9 sm:h-7',
  },
}

/** Connected spreadsheet-style tabs shared by project and estimate workspaces. */
export function worksheetTabClass(active: boolean, first: boolean, size: WorksheetTabSize = 'default') {
  const sizing = TAB_SIZE[size]
  return cn(
    'relative flex shrink-0 items-center whitespace-nowrap rounded-t-tab border-r border-t border-border transition-colors',
    'focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
    sizing.base,
    first && 'border-l',
    active
      ? cn(
          'border-b border-b-card bg-card font-semibold text-foreground before:absolute before:-inset-x-px before:top-[-1px] before:rounded-t-tab before:bg-tab-accent',
          sizing.active,
        )
      : cn('border-b bg-muted/70 font-medium text-muted-foreground hover:bg-muted hover:text-foreground', sizing.inactive),
  )
}

export const worksheetStripClass =
  'overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

export const worksheetFillerClass = 'min-w-4 flex-1 self-stretch border-b border-border'
