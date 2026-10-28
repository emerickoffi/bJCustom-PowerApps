'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getActiveProjectNavKey, getSectionIdFromHref, type ProjectNavItem } from '@/lib/project-nav'
import { scrollToProjectSection } from '@/components/projects/project-section-scroll'

export function ProjectNav({
  projectId,
  projectName,
  projectNumber,
  items,
}: {
  projectId: string
  projectName: string
  projectNumber: string | null
  items: ProjectNavItem[]
}) {
  const pathname = usePathname()
  const activeKey = getActiveProjectNavKey(pathname, projectId, items)
  const activeTabRef = useRef<HTMLAnchorElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

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

  // The sentinel sits just above the sticky bar; once it passes under the app header the bar is pinned.
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const headerHeight = document.querySelector<HTMLElement>('[data-app-header]')?.offsetHeight ?? 64
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < headerHeight),
      { rootMargin: `-${headerHeight}px 0px 0px 0px` },
    )
    observer.observe(sentinel)
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

  return (
    <>
      <nav aria-label="Breadcrumb">
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
        </ol>
      </nav>

      <div ref={sentinelRef} aria-hidden="true" className="-mt-6 h-px" />

      <div
        data-project-tabs
        className={cn(
          'sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 -mt-3 border-b border-transparent bg-background/95 px-4 py-2 backdrop-blur-sm transition-[border-color,box-shadow] sm:top-[calc(4rem+env(safe-area-inset-top))] sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10',
          stuck && 'border-border shadow-[0_6px_12px_-10px_rgb(0_0_0/0.25)]',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {stuck && (
            <span aria-hidden="true" className="hidden max-w-56 shrink-0 truncate font-serif text-sm font-semibold text-foreground md:block">
              {projectName}
            </span>
          )}
          <nav aria-label="Project sections" className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex w-max min-w-full gap-1 rounded-xl border bg-card p-1 shadow-xs md:min-w-0">
              {items.map((item) => {
                const active = item.key === activeKey
                return (
                  <li key={item.key} className="flex-1 md:flex-none">
                    <Link
                      href={item.href}
                      ref={active ? activeTabRef : undefined}
                      onClick={(event) => handleSectionClick(event, item.href)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex h-11 items-center justify-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors sm:h-9',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                        active
                          ? 'bg-primary text-primary-foreground shadow-xs ring-1 ring-inset ring-champagne/40'
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
    </>
  )
}
