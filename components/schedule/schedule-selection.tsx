'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { JOB_SWITCH_EVENT } from '@/lib/route-job'

/** The `?project=` value a /schedule URL points at, or null for any other route. */
function scheduleTarget(href: string): string | null {
  const url = new URL(href, window.location.origin)
  if (url.pathname !== '/schedule') return null
  return url.searchParams.get('project') ?? ''
}

/**
 * Hides the rendered schedule as soon as a navigation to a different project starts (top-bar selector,
 * back/forward, or an in-page link), so the previous project's records never sit on screen while the next
 * one loads. Router navigations supersede each other, so a slow earlier response can't replace a newer one.
 */
export function ScheduleBody({ renderedFor, children }: { renderedFor: string; children: React.ReactNode }) {
  const [target, setTarget] = useState<string | null>(null)
  const [seen, setSeen] = useState(renderedFor)
  if (seen !== renderedFor) {
    setSeen(renderedFor)
    setTarget(null)
  }

  useEffect(() => {
    const follow = (href: string) => {
      const next = scheduleTarget(href)
      if (next !== null) setTarget(next)
    }
    const onSwitch = (e: Event) => follow((e as CustomEvent<string>).detail)
    const onPop = () => follow(window.location.href)
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (link && !link.target) follow(link.href)
    }
    window.addEventListener(JOB_SWITCH_EVENT, onSwitch)
    window.addEventListener('popstate', onPop)
    document.addEventListener('click', onClick)
    return () => {
      window.removeEventListener(JOB_SWITCH_EVENT, onSwitch)
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('click', onClick)
    }
  }, [])

  if (target === null || target === renderedFor) return <>{children}</>
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 rounded-xl border bg-card px-4 py-10 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading schedule…
    </div>
  )
}
