'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  IDLE_GLOW_DURATION_MS,
  IDLE_GLOW_KEYFRAMES,
  nextIdleGlowDelay,
  shouldSuppressIdleGlow,
} from '@/lib/idle-glow'

const OVERLAY_SELECTOR = "[data-slot='dialog-overlay'], [data-slot='sheet-overlay'], [data-slot='form-overlay'], [role='alertdialog']"

function isEditing(): boolean {
  const el = document.activeElement
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true
  return el instanceof HTMLInputElement && !['button', 'submit', 'reset', 'checkbox', 'radio', 'file'].includes(el.type)
}

/**
 * Plays one soft halo pulse on `glowRef` at a random 30–90s interval while `idle` is true.
 * Runs through the Web Animations API so the launcher never re-renders for it. Conditions that change
 * without React knowing (focus, dialogs, hover, tab visibility) are checked when the timer fires.
 * Returns `stop`, which cancels a pulse in flight (hover, click).
 */
export function useIdleGlow(glowRef: RefObject<HTMLElement | null>, hoverRef: RefObject<HTMLElement | null>, idle: boolean) {
  const animation = useRef<Animation | null>(null)

  const stop = useCallback(() => {
    animation.current?.cancel()
    animation.current = null
  }, [])

  useEffect(() => {
    if (!idle) return
    let timer: number | null = null

    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer)
      timer = window.setTimeout(fire, nextIdleGlowDelay())
    }

    const fire = () => {
      timer = null
      const glow = glowRef.current
      const suppressed = shouldSuppressIdleGlow({
        hidden: document.visibilityState !== 'visible',
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        hovered: hoverRef.current?.matches(':hover') ?? false,
        editing: isEditing(),
        overlayOpen: document.querySelector(OVERLAY_SELECTOR) !== null,
      })
      if (glow && !suppressed && typeof glow.animate === 'function') {
        animation.current?.cancel()
        animation.current = glow.animate(IDLE_GLOW_KEYFRAMES, {
          duration: IDLE_GLOW_DURATION_MS,
          easing: 'ease-in-out',
        })
      }
      schedule()
    }

    // A hidden tab drops its pulse and starts a fresh interval on return, so nothing fires the moment it's back.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') schedule()
      else {
        stop()
        if (timer !== null) window.clearTimeout(timer)
        timer = null
      }
    }

    schedule()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      if (timer !== null) window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [idle, glowRef, hoverRef, stop])

  return stop
}
