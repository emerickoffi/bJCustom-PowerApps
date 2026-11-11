'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Info, MapPin, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getActiveProjectMoreKey,
  getActiveProjectNavKey,
  getSectionIdFromHref,
  type ProjectMoreItem,
  type ProjectNavItem,
} from '@/lib/project-nav'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { scrollToProjectSection } from '@/components/projects/project-section-scroll'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { worksheetTabClass } from '@/components/shared/worksheet-tabs'
import type { ProjectStatus } from '@/lib/domain'

type SectionMemory = Record<string, { url?: string; y?: number }>

function readMemory(key: string): SectionMemory {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? '{}') as SectionMemory
  } catch {
    return {}
  }
}

function isCreationPath(path: string) {
  return /\/new\/?$/.test(path)
}

function writeMemory(key: string, memory: SectionMemory) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(memory))
  } catch {
    // Storage can be full or disabled; tabs then simply open at their default view.
  }
}

export function ProjectNav({
  userId,
  projectId,
  projectNumber,
  status,
  address,
  items,
  moreItems = [],
}: {
  userId: string
  projectId: string
  projectNumber: string | null
  status: ProjectStatus
  address: string
  items: ProjectNavItem[]
  /** Tools without a permanent tab, reached from the overflow menu after the last tab. Hidden when empty. */
  moreItems?: ProjectMoreItem[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const activeKey = getActiveProjectNavKey(pathname, projectId, items)
  const activeMoreKey = getActiveProjectMoreKey(pathname, moreItems)

  // Each tab reopens with the filters, view and scroll position last used in it. Keyed by user and project,
  // so another project or account never inherits them; only URLs inside this project's sections are stored.
  const memoryKey = `bateevo:project-sections:${userId}:${projectId}`
  const [memory, setMemory] = useState<SectionMemory>({})
  const activeKeyRef = useRef(activeKey)
  const suppressScrollSave = useRef(false)
  const pendingRestore = useRef<{ key: string; y: number } | null>(null)

  useEffect(() => {
    setMemory(readMemory(memoryKey))
  }, [memoryKey])

  useEffect(() => {
    activeKeyRef.current = activeKey
    if (!activeKey) return
    // Creation flows are transient: returning to a tab must land on its index, never a new-record form.
    if (isCreationPath(pathname)) return
    const current = readMemory(memoryKey)
    // An open details drawer is not part of a tab's remembered view, so returning to the tab never reopens it.
    const remembered = new URLSearchParams(search)
    remembered.delete('details')
    remembered.delete('new')
    const query = remembered.toString()
    current[activeKey] = { ...current[activeKey], url: query ? `${pathname}?${query}` : pathname }
    writeMemory(memoryKey, current)
    setMemory(current)
  }, [activeKey, pathname, search, memoryKey])

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (suppressScrollSave.current || frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const key = activeKeyRef.current
        if (!key || suppressScrollSave.current) return
        const current = readMemory(memoryKey)
        current[key] = { ...current[key], y: Math.round(window.scrollY) }
        writeMemory(memoryKey, current)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [memoryKey])

  // Content streams in after navigation, so the saved position is retried until it fits or the user takes over.
  useEffect(() => {
    const pending = pendingRestore.current
    if (!pending || pending.key !== activeKey) {
      suppressScrollSave.current = false
      return
    }
    pendingRestore.current = null
    let cancelled = false
    const stop = () => {
      cancelled = true
    }
    const started = performance.now()
    const tick = () => {
      if (cancelled) return
      window.scrollTo({ top: pending.y })
      if (Math.abs(window.scrollY - pending.y) <= 2 || performance.now() - started > 2000) {
        suppressScrollSave.current = false
        return
      }
      requestAnimationFrame(tick)
    }
    window.addEventListener('wheel', stop, { once: true, passive: true })
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    window.addEventListener('keydown', stop, { once: true })
    requestAnimationFrame(tick)
    return () => {
      cancelled = true
      suppressScrollSave.current = false
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('keydown', stop)
    }
  }, [activeKey])

  function hrefFor(item: ProjectNavItem) {
    const saved = memory[item.key]?.url
    const base = item.activePrefix ?? item.href.split(/[?#]/)[0]
    // Only reuse a remembered URL that still points inside this tab's own route.
    if (saved && isCreationPath(saved.split('?')[0])) return item.href
    if (saved && (saved === base || saved.startsWith(`${base}?`) || saved.startsWith(`${base}/`))) return saved
    return item.href
  }

  function handleTabClick(event: React.MouseEvent<HTMLAnchorElement>, item: ProjectNavItem, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (item.key === activeKey) return handleSectionClick(event, href)
    const current = readMemory(memoryKey)
    if (activeKey) current[activeKey] = { ...current[activeKey], y: Math.round(window.scrollY) }
    writeMemory(memoryKey, current)
    suppressScrollSave.current = true
    const y = current[item.key]?.y ?? 0
    pendingRestore.current = y > 0 ? { key: item.key, y } : null
    handleSectionClick(event, href)
  }

  const activeTabRef = useRef<HTMLAnchorElement>(null)
  const stripRef = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  function updateEdges() {
    const strip = stripRef.current
    if (!strip) return
    const left = strip.scrollLeft > 2
    const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }

  // Fades hint at hidden tabs; recompute whenever the strip or its contents resize (rotation, sidebar toggle).
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(strip)
    if (strip.firstElementChild) observer.observe(strip.firstElementChild)
    return () => observer.disconnect()
  }, [])

  // On narrow screens the tab strip scrolls sideways; keep the selected tab visible without moving the page vertically.
  useEffect(() => {
    const tab = activeTabRef.current
    const strip = stripRef.current
    if (!tab || !strip || strip.scrollWidth <= strip.clientWidth) return
    const stripBox = strip.getBoundingClientRect()
    const tabBox = tab.getBoundingClientRect()
    if (tabBox.left < stripBox.left + 24 || tabBox.right > stripBox.right - 24) {
      const target = strip.scrollLeft + (tabBox.left - stripBox.left) - (stripBox.width - tabBox.width) / 2
      strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
    }
  }, [activeKey])

  // The tab strip pins directly under the app header. Its height varies with breakpoint and safe-area inset,
  // so it is measured instead of hard-coded; a fixed guess left a gap or let the strip cover content.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]')
    if (!header) return
    const apply = () => document.documentElement.style.setProperty('--app-header-h', `${header.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const overviewHref = items[0]?.href ?? `/projects/${projectId}`

  // On the overview itself, scroll directly: a repeated hash click is otherwise a no-op in the router.
  // From other tabs the Link navigates and ProjectSectionScroll handles the hash after mount.
  function handleSectionClick(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const sectionId = getSectionIdFromHref(href)
    if (!sectionId || activeKey !== 'overview') return
    if (!scrollToProjectSection(sectionId)) return
    event.preventDefault()
    window.history.replaceState(window.history.state, '', href)
  }

  // The details drawer is mounted on the overview, so there the URL changes in place instead of refetching the page.
  function handleDetailsClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (activeKey !== 'overview') return
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const params = new URLSearchParams(window.location.search)
    params.set('details', 'open')
    window.history.replaceState(window.history.state, '', `${pathname}?${params.toString()}`)
  }

  return (
    <>
      {/* The project's name lives in the header selector; this row adds what the selector doesn't show. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pb-3">
        {projectNumber && (
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            <span className="sr-only">Project ID: </span>
            {projectNumber}
          </span>
        )}
        <ProjectStatusBadge status={status} />
        {address && (
          <span className="order-last flex w-full min-w-0 items-center gap-1 text-sm text-muted-foreground md:order-none md:w-auto md:flex-1">
            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
            <span className="sr-only">Address:</span>
            <span className="truncate">{address}</span>
          </span>
        )}
        <Link
          href={`${overviewHref}?details=open`}
          onClick={handleDetailsClick}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
        >
          <Info className="size-3.5" aria-hidden="true" />
          Project details
        </Link>
      </div>

      <div
        data-project-tabs
        className="sticky top-[var(--app-header-h,calc(3.5rem+env(safe-area-inset-top)))] z-20 bg-background pt-1.5"
      >
        <div className="flex min-w-0 items-end">
        <div className="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute bottom-px left-0 top-0 z-10 w-10 bg-gradient-to-r from-background to-transparent transition-opacity',
              edges.left ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute bottom-px right-0 top-0 z-10 w-10 bg-gradient-to-l from-background to-transparent transition-opacity',
              edges.right ? 'opacity-100' : 'opacity-0',
            )}
          />
          <nav
            ref={stripRef}
            onScroll={updateEdges}
            aria-label="Project sections"
            className="overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex w-max min-w-full items-end">
              {items.map((item, index) => {
                const active = item.key === activeKey
                const href = hrefFor(item)
                return (
                  <li key={item.key} className="flex">
                    <Link
                      href={href}
                      ref={active ? activeTabRef : undefined}
                      onClick={(event) => handleTabClick(event, item, href)}
                      aria-current={active ? 'page' : undefined}
                      className={worksheetTabClass(active, index === 0)}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
              <li aria-hidden="true" className="min-w-4 flex-1 self-stretch border-b border-border" />
            </ul>
          </nav>
        </div>
        {moreItems.length > 0 && (
          // Sits after the scrolling strip, so it is always reachable and no tab changes position.
          <div className="flex shrink-0 items-end self-stretch border-b border-border pl-1">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="More project tools"
                className={cn(
                  'relative inline-flex h-11 items-center gap-1.5 rounded-t-tab px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground sm:h-9',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                  activeMoreKey &&
                    'font-semibold text-foreground before:absolute before:inset-x-0 before:bottom-[-1px] before:h-0.5 before:bg-tab-accent',
                )}
              >
                <MoreHorizontal className="size-4" aria-hidden="true" />
                More
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={6} className="min-w-52">
                {moreItems.map((item) => (
                  <DropdownMenuItem
                    key={item.key}
                    render={<Link href={item.href} aria-current={item.key === activeMoreKey ? 'page' : undefined} />}
                    className="min-h-11 sm:min-h-0"
                  >
                    {item.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        </div>
      </div>
    </>
  )
}
