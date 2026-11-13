/**
 * Shared CSS-only pattern for keeping a table's identifying column visible while
 * the rest of a wide table scrolls horizontally inside one `overflow-x-auto` container.
 *
 * Sticky cells need an opaque background, otherwise scrolled content shows through,
 * so each row state (default, hover, highlighted) maps to a solid color-mix.
 */

/** Divider on the trailing edge of the last frozen column. */
export const FROZEN_EDGE = 'shadow-[6px_0_8px_-6px_rgb(0_0_0/0.12)] border-r border-border/60'

/** Header cells: above body cells so vertical page scroll never tucks a body cell over them. */
export const FROZEN_HEAD = 'sticky z-[3] bg-table-head'

/** Body cells in a row that uses the `group` class for hover. */
export const FROZEN_BODY = 'sticky z-[2] bg-card group-hover:bg-[color-mix(in_oklab,var(--sage)_30%,var(--card))]'

/** Body cell background for allowance / highlighted rows (`bg-link-soft/60` equivalent, opaque). */
export const FROZEN_BODY_HIGHLIGHT =
  'bg-[color-mix(in_oklab,var(--link-soft)_60%,var(--card))] group-hover:bg-[color-mix(in_oklab,var(--sage)_30%,var(--card))]'
