'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronRight, Info, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getActiveProjectNavKey, getSectionIdFromHref, type ProjectNavItem } from '@/lib/project-nav'
import { scrollToProjectSection } from '@/components/projects/project-section-scroll'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import type { ProjectStatus } from '@/lib/domain'

type SectionMemory = Record<string, { url?: string; y?: number }>

function readMemory(key: string): SectionMemory {
  try {
    return JSON.parse(window.sessionStorage.getItem(key) ?? '{}') as SectionMemory
  } catch {
    return {}
  }
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
  projectName,
  projectNumber,
  status,
  address,
  items,
}: {
  userId: string
  projectId: string
  projectName: string
  projectNumber: string | null
  status: ProjectStatus
  address: string
  items: ProjectNavItem[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const activeKey = getActiveProjectNavKey(pathname, projectId, items)

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
    const current = readMemory(memoryKey)
    current[activeKey] = { ...current[activeKey], url: search ? `${pathname}?${search}` : pathname }
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
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const stripRef = useRef<HTMLElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  function updateEdges() {
    const strip = stripRef.current
    if (!strip) return
    const left = strip.scrollLeft > 2
    const right = strip.scrollLeft + strip.clientWidth < strip.scrollWidth - 2
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }

  // Fades hint at hidden tabs; recompute whenever the strip or its contents resize (rotation, sidebar toggle, sticky title).
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
    const strip = tab?.closest('nav')
    if (!tab || !strip || strip.scrollWidth <= strip.clientWidth) return
    const stripBox = strip.getBoundingClientRect()
    const tabBox = tab.getBoundingClientRect()
    if (tabBox.left < stripBox.left || tabBox.right > stripBox.right) {
      const target = strip.scrollLeft + (tabBox.left - stripBox.left) - 16
      strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
    }
  }, [activeKey])

  // The tab bar pins directly under the app header. Its height varies with breakpoint, safe-area inset and
  // wrapping content, so it is measured instead of hard-coded; a fixed guess left a gap or overlap.
  const [headerHeight, setHeaderHeight] = useState<number | null>(null)
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]')
    if (!header) return
    const apply = () => {
      const height = header.offsetHeight
      document.documentElement.style.setProperty('--app-header-h', `${height}px`)
      setHeaderHeight(height)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // The sentinel sits just above the sticky bar; once it passes under the app header the bar is pinned.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || headerHeight === null) return
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < headerHeight),
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [headerHeight])

  const overviewHref = items[0]?.href ?? `/projects/${projectId}`
  const activeTab = items.find((item) => item.key === activeKey)

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

  // On Documents, the global header breadcrumb (shown at lg outside tablet mode) is the only breadcrumb.
  const deferToGlobalBreadcrumb = activeKey === 'documents'

  const isOverview = activeKey === 'overview'

  return (
    <>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <nav aria-label="Breadcrumb" className={cn('min-w-0', deferToGlobalBreadcrumb && 'lg:hidden tablet:block')}>
        <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/projects" className="inline-flex min-h-11 items-center font-medium transition-colors hover:text-primary sm:min-h-0">
              Projects
            </Link>
          </li>
          <li aria-hidden="true">
            <ChevronRight className="size-3.5" />
          </li>
          <li className="min-w-0">
            {activeKey === 'overview' ? (
              <span aria-current="page" className="block truncate font-medium text-foreground">
                {projectName}
              </span>
            ) : (
              <Link
                href={overviewHref}
                className="inline-flex min-h-11 min-w-0 items-center gap-1.5 font-medium transition-colors hover:text-primary sm:min-h-0"
              >
                {projectNumber && <span className="font-mono text-xs">{projectNumber}</span>}
                <span className="truncate">{projectName}</span>
              </Link>
            )}
          </li>
          {activeTab && activeKey !== 'overview' && (
            <>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li>
                <span aria-current="page" className="font-medium text-foreground">
                  {activeTab.label}
                </span>
              </li>
            </>
          )}
        </ol>
      </nav>
      {/* The Overview renders its own full project header; other sections get this compact identity row. */}
      {!isOverview && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <ProjectStatusBadge status={status} />
          {address && (
            <span className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span className="sr-only">Address:</span>
              <span className="truncate">{address}</span>
            </span>
          )}
          <Link
            href={`${overviewHref}?details=open`}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline sm:min-h-0"
          >
            <Info className="size-3.5" aria-hidden="true" />
            Project details
          </Link>
        </div>
      )}
      </div>

      <div ref={sentinelRef} aria-hidden="true" className={cn('-mt-6 h-px', deferToGlobalBreadcrumb && 'lg:mt-0 tablet:-mt-6')} />

      <div
        data-project-tabs
        className={cn(
          deferToGlobalBreadcrumb && 'lg:-mt-6 tablet:-mt-3',
          'sticky top-[var(--app-header-h,calc(4rem+env(safe-area-inset-top)))] z-20 -mx-4 -mt-3 border-b border-transparent bg-background px-4 py-2 transition-[border-color,box-shadow] sm:-mx-6 sm:px-6 xl:-mx-10 xl:px-10',
          stuck && 'border-border shadow-[0_6px_12px_-10px_rgb(0_0_0/0.25)]',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {stuck && (
            <span aria-hidden="true" className="hidden max-w-56 shrink-0 truncate font-serif text-sm font-semibold text-foreground md:block">
              {projectName}
            </span>
          )}
          <div className="relative min-w-0 flex-1">
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 z-10 w-8 rounded-l-xl bg-gradient-to-r from-background to-transparent transition-opacity',
              edges.left ? 'opacity-100' : 'opacity-0',
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-0 right-0 z-10 w-8 rounded-r-xl bg-gradient-to-l from-background to-transparent transition-opacity',
              edges.right ? 'opacity-100' : 'opacity-0',
            )}
          />
          <nav
            ref={stripRef}
            onScroll={updateEdges}
            aria-label="Project sections"
            className="overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex w-max min-w-full gap-1 rounded-xl border bg-card p-1 shadow-xs md:min-w-0">
              {items.map((item) => {
                const active = item.key === activeKey
                const href = hrefFor(item)
                return (
                  <li key={item.key} className="flex-1 md:flex-none">
                    <Link
                      href={href}
                      ref={active ? activeTabRef : undefined}
                      onClick={(event) => handleTabClick(event, item, href)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-11 items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors sm:h-9',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                        active
                          ? 'bg-primary text-primary-foreground shadow-xs ring-1 ring-inset ring-link-border/50'
                          : 'text-muted-foreground hover:bg-sage hover:text-primary',
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          </div>
        </div>
      </div>
    </>
  )
}
