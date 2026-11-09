/**
 * Shared styling for selected UI controls (view switches, segmented controls, filter pills).
 * This is about the selected control, not a record's "Active" status badge.
 */

const focus = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'

/** A button/link inside a segmented group. Selected is solid teal; unselected hovers soft teal. */
export function segmentClass(selected: boolean) {
  return [
    'border transition-colors motion-reduce:transition-none',
    focus,
    selected
      ? 'border-interactive bg-interactive text-white hover:bg-interactive-hover active:bg-interactive-pressed'
      : 'border-transparent text-foreground hover:bg-interactive-soft hover:text-interactive-strong',
  ].join(' ')
}

/**
 * A standalone filter pill/chip (status filters). Filters only narrow a list and never change a record, so the
 * selected state is the orange selected tint plus a darker-orange border — distinct from teal view switches
 * and from worksheet tabs. Pair with `aria-current`/`aria-pressed` so selection isn't conveyed by color alone.
 */
export function pillClass(selected: boolean) {
  return [
    'border transition-colors motion-reduce:transition-none',
    focus,
    selected
      ? 'border-selected-border bg-selected font-semibold text-foreground hover:bg-action-soft'
      : 'border-border bg-card text-foreground hover:border-interactive-border hover:bg-interactive-soft hover:text-interactive-strong',
  ].join(' ')
}

/** Underline tab: keeps the underline layout, selected is teal text and teal underline. */
export function underlineTabClass(selected: boolean) {
  return selected
    ? 'border-interactive text-interactive-strong'
    : 'border-transparent text-muted-foreground hover:text-interactive-strong'
}
