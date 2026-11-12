/** Idle glow on the AI launcher: one soft teal pulse every 30–90 seconds while nothing else is happening. */
export const IDLE_GLOW_MIN_MS = 30_000
export const IDLE_GLOW_MAX_MS = 90_000
export const IDLE_GLOW_DURATION_MS = 1400

/** Halo grows from the button's edge to 1.2x while it fades in to 0.3 and back out to nothing. */
export const IDLE_GLOW_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: 'scale(1)' },
  { opacity: 0.3, transform: 'scale(1.06)', offset: 0.3 },
  { opacity: 0, transform: 'scale(1.2)' },
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
