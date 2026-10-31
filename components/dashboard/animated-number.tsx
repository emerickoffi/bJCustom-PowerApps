'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCents } from '@/lib/format'

export type AnimatedNumberFormat = 'cents' | 'count'

const DURATION_MS = 750
const countFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function formatValue(value: number, format: AnimatedNumberFormat) {
  const rounded = Math.round(value)
  return format === 'cents' ? formatCents(rounded) : countFormatter.format(rounded)
}

/**
 * Counts up to `value` once when first visible, then tweens between later values.
 * The server renders the final value; `data-count-pending` hides only the visible digits
 * (via CSS, when scripting is enabled) until the count starts, so there is no flash of the
 * final number before it rolls up from zero.
 */
export function AnimatedNumber({ value, format }: { value: number; format: AnimatedNumberFormat }) {
  const [display, setDisplay] = useState(value)
  const [pending, setPending] = useState(value !== 0)
  const ref = useRef<HTMLSpanElement>(null)
  const target = useRef(value)
  const shown = useRef(value)
  const started = useRef(false)
  const frame = useRef(0)

  const show = (next: number) => {
    shown.current = next
    setDisplay(next)
  }

  const tween = (from: number, to: number) => {
    cancelAnimationFrame(frame.current)
    if (from === to || prefersReducedMotion()) {
      show(to)
      return
    }
    show(from)
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS)
      show(from + (to - from) * easeOutCubic(progress))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    target.current = value
    if (started.current) tween(shown.current, value)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tween only reads refs and stable setters
  }, [value])

  useEffect(() => {
    const begin = () => {
      started.current = true
      setPending(false)
      tween(0, target.current)
    }

    const el = ref.current
    if (target.current === 0 || prefersReducedMotion() || !el) {
      started.current = true
      setPending(false)
      return
    }
    if (typeof IntersectionObserver === 'undefined') {
      begin()
      return () => cancelAnimationFrame(frame.current)
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect()
        begin()
      }
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount (one dashboard visit)
  }, [])

  const finalText = formatValue(value, format)

  return (
    <span ref={ref} className="relative inline-grid">
      <span aria-hidden="true" className="invisible col-start-1 row-start-1">
        {finalText}
      </span>
      <span aria-hidden="true" data-count-pending={pending || undefined} className="col-start-1 row-start-1">
        {formatValue(display, format)}
      </span>
      <span className="sr-only">{finalText}</span>
    </span>
  )
}
