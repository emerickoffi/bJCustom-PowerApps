'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Info, MapPin } from 'lucide-react'
import {
  getActiveProjectToolKey,
  getSectionIdFromHref,
  type ProjectTool,
  type ProjectToolGroup,
} from '@/lib/project-nav'
import { scrollToProjectSection } from '@/components/projects/project-section-scroll'
import { ProjectToolsMenu, ProjectToolsScope, type ProjectToolNavigate } from '@/components/projects/project-tools-menu'
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

function isCreationPath(path: string) {
  return /\/new\/?$/.test(path)
}

function writeMemory(key: string, memory: SectionMemory) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(memory))
  } catch {
    // Storage can be full or disabled; tools then simply open at their default view.
  }
}

export function ProjectNav({
  userId,
  projectId,
  projectNumber,
  status,
  address,
  groups,
}: {
  userId: string
  projectId: string
  projectNumber: string | null
  status: ProjectStatus
  address: string
  /** Tools this user may open, already filtered by features and access on the server. */
  groups: ProjectToolGroup[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const tools = groups.flatMap((group) => group.tools)
  const activeKey = getActiveProjectToolKey(pathname, projectId, tools)

  // Each tool reopens with the filters, view and scroll position last used in it. Keyed by user and project,
  // so another project or account never inherits them; only URLs inside this project's tools are stored.
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
    // Creation flows are transient: returning to a tool must land on its index, never a new-record form.
    if (isCreationPath(pathname)) return
    const current = readMemory(memoryKey)
    // An open details drawer is not part of a tool's remembered view, so returning to the tool never reopens it.
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

  function hrefFor(tool: ProjectTool) {
    const saved = memory[tool.key]?.url
    const base = tool.activePrefix ?? tool.href.split(/[?#]/)[0]
    // Only reuse a remembered URL that still points inside this tool's own route.
    if (saved && isCreationPath(saved.split('?')[0])) return tool.href
    if (saved && (saved === base || saved.startsWith(`${base}?`) || saved.startsWith(`${base}/`))) return saved
    return tool.href
  }

  // The app header's height varies with breakpoint and safe-area inset; sticky panels in project tools read it.
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('[data-app-header]')
    if (!header) return
    const apply = () => document.documentElement.style.setProperty('--app-header-h', `${header.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  const overviewHref = tools.find((tool) => tool.key === 'overview')?.href ?? `/projects/${projectId}`

  // On the overview itself, scroll directly: a repeated hash click is otherwise a no-op in the router.
  function handleSectionClick(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    const sectionId = getSectionIdFromHref(href)
    if (!sectionId || activeKey !== 'overview') return
    if (!scrollToProjectSection(sectionId)) return
    event.preventDefault()
    window.history.replaceState(window.history.state, '', href)
  }

  function handleToolNavigate(event: React.MouseEvent<HTMLAnchorElement>, tool: ProjectTool, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (tool.key === activeKey) return handleSectionClick(event, href)
    const current = readMemory(memoryKey)
    if (activeKey) current[activeKey] = { ...current[activeKey], y: Math.round(window.scrollY) }
    writeMemory(memoryKey, current)
    suppressScrollSave.current = true
    const y = current[tool.key]?.y ?? 0
    pendingRestore.current = y > 0 ? { key: tool.key, y } : null
    handleSectionClick(event, href)
  }

  // The header menu is registered once; a ref keeps it calling the latest handler without re-registering.
  const navigateRef = useRef(handleToolNavigate)
  navigateRef.current = handleToolNavigate
  const onNavigate = useCallback<ProjectToolNavigate>((event, tool, href) => navigateRef.current(event, tool, href), [])

  const resolvedGroups = groups.map((group) => ({
    ...group,
    tools: group.tools.map((tool) => ({ ...tool, href: hrefFor(tool) })),
  }))

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
      <ProjectToolsScope groups={resolvedGroups} activeKey={activeKey} onNavigate={onNavigate} />
      {/* The project's name lives in the header selector; this row adds what the selector doesn't show. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 pb-3">
        {/* Below md the header has no room for a second selector, so the same menu sits at the top of the frame. */}
        <div className="w-full md:hidden">
          <ProjectToolsMenu groups={resolvedGroups} activeKey={activeKey} onNavigate={onNavigate} className="h-11 w-full max-w-none" />
        </div>
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
    </>
  )
}
