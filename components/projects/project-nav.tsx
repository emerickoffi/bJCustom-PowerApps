'use client'

import { useEffect, useRef } from 'react'
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
    <div className="flex flex-col gap-3">
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

      <nav aria-label="Project sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max min-w-full gap-1 border-b border-border">
          {items.map((item) => {
            const active = item.key === activeKey
            return (
              <li key={item.key}>
                <Link
                  href={item.href}
                  ref={active ? activeTabRef : undefined}
                  onClick={(event) => handleSectionClick(event, item.href)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex h-11 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
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
  )
}
