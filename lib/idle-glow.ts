/** Idle glow on the AI launcher: one soft teal pulse every 30–90 seconds while nothing else is happening. */
export const IDLE_GLOW_MIN_MS = 30_000
export const IDLE_GLOW_MAX_MS = 90_000
export const IDLE_GLOW_DURATION_MS = 1400

export const IDLE_GLOW_MAX_OPACITY = 0.35

/**
 * The halo sits behind an opaque launcher of the same color, so only the part past the button's edge is ever seen.
 * It holds near full strength while it expands to 1.25x, then fades out, so the visible ring peaks while still bright.
 */
export const IDLE_GLOW_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'scale(1)' },
  { opacity: IDLE_GLOW_MAX_OPACITY, transform: 'scale(1.12)', offset: 0.35 },
  { opacity: 0.28, transform: 'scale(1.22)', offset: 0.7 },
  { opacity: 0, transform: 'scale(1.25)' },
]

export function nextIdleGlowDelay(random: () => number = Math.random): number {
  const r = Math.min(Math.max(random(), 0), 1)
  return Math.round(IDLE_GLOW_MIN_MS + r * (IDLE_GLOW_MAX_MS - IDLE_GLOW_MIN_MS))
}

export type GlowSuppressors = {
  hidden: boolean
  reducedMotion: boolean
  hovered: boolean
  editing: boolean
  overlayOpen: boolean
}

export function shouldSuppressIdleGlow(s: GlowSuppressors): boolean {
  return s.hidden || s.reducedMotion || s.hovered || s.editing || s.overlayOpen
}
